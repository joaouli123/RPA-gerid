const URL_REQUERIMENTOS_GERID = 'https://atendimento.inss.gov.br/requerimentos';
const URL_LOGIN_GERID = 'https://geridinss.dataprev.gov.br/';
const URL_PAINEL_RPA = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';
const CHAVE_EXECUCAO_ATIVA = 'execucaoAtivaGerid';
const CHAVE_ESTADO_AUTENTICACAO = 'estadoAutenticacaoGerid';
const CHAVE_ULTIMO_AVISO_AUTENTICACAO = 'ultimoAvisoAutenticacaoGerid';
const CHAVE_LOGS = 'logsGerid';
const ALARME_RETOMADA = 'retomarExecucaoGerid';
const ALARME_AUTENTICACAO = 'aguardarAutenticacaoGerid';
const ALARME_CONFIRMACAO = 'verificarConfirmacaoGerid';
const MAX_RETOMADAS_AUTOMATICAS = 3;
const MAX_LOGS = 80;

const EstadoAutenticacao = {
  SEM_ABA: 'sem_aba',
  NECESSARIA: 'autenticacao_necessaria',
  AUTENTICADO: 'autenticado',
};

let isRunning = false;
let filaLogs = Promise.resolve();

async function sincronizarAutorizacaoDoPainel() {
  const abas = await chrome.tabs.query({ url: `${URL_PAINEL_RPA}/*` }).catch(() => []);
  await Promise.all(abas.map((aba) => {
    if (!aba.id) return Promise.resolve();
    return chrome.scripting.executeScript({
      target: { tabId: aba.id },
      files: ['bootstrap.js'],
    }).catch(() => undefined);
  }));
}

function sendLog(message) {
  console.log(message);
  chrome.runtime.sendMessage({ action: 'log', message }).catch(() => {});
  filaLogs = filaLogs.then(async () => {
    const salvo = await chrome.storage.local.get([CHAVE_LOGS]);
    const logs = Array.isArray(salvo[CHAVE_LOGS]) ? salvo[CHAVE_LOGS] : [];
    logs.unshift({ mensagem: String(message), em: new Date().toISOString() });
    await chrome.storage.local.set({ [CHAVE_LOGS]: logs.slice(0, MAX_LOGS) });
  }).catch(() => undefined);
}

function estadoDaAba(tab) {
  const url = String(tab?.url || '');
  if (url.includes('://geridinss.dataprev.gov.br/')) return EstadoAutenticacao.NECESSARIA;
  if (url.includes('://atendimento.inss.gov.br/')) {
    if (/^https?:\/\/atendimento\.inss\.gov\.br\/(tarefas|requerimentos)(?:[/?#]|$)/i.test(url)) {
      return EstadoAutenticacao.AUTENTICADO;
    }
    return EstadoAutenticacao.NECESSARIA;
  }
  return EstadoAutenticacao.SEM_ABA;
}

function abaDoPortalPat(tab) {
  return String(tab?.url || '').includes('://atendimento.inss.gov.br/');
}

async function atualizarEstadoAutenticacao(estado, mensagem, tabId) {
  const registro = { estado, mensagem, tabId, atualizadoEm: new Date().toISOString() };
  await chrome.storage.local.set({ [CHAVE_ESTADO_AUTENTICACAO]: registro });
  const autenticado = estado === EstadoAutenticacao.AUTENTICADO;
  await chrome.action?.setBadgeBackgroundColor?.({ color: autenticado ? '#15803d' : '#b45309' });
  await chrome.action?.setBadgeText?.({ text: autenticado ? 'OK' : '!' });
  chrome.runtime.sendMessage({ action: 'auth_state', ...registro }).catch(() => {});
  return registro;
}

async function avisarAutenticacaoNecessaria() {
  const salvo = await chrome.storage.local.get([CHAVE_ULTIMO_AVISO_AUTENTICACAO]);
  const ultimo = Number(salvo[CHAVE_ULTIMO_AVISO_AUTENTICACAO] || 0);
  if (Date.now() - ultimo < 10 * 60 * 1000) return;
  await chrome.storage.local.set({ [CHAVE_ULTIMO_AVISO_AUTENTICACAO]: Date.now() });
  await chrome.notifications?.create?.('gerid-autenticacao', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'Autenticacao do GERID necessaria',
    message: 'Conclua o certificado SafeID e o codigo do autenticador. A fila sera retomada sozinha.',
    priority: 2,
  });
}

function agendarRetomadaAutenticacao() {
  chrome.alarms?.create?.(ALARME_AUTENTICACAO, { delayInMinutes: 0.1 });
}

function agendarVerificacaoConfirmacao() {
  chrome.alarms?.create?.(ALARME_CONFIRMACAO, { delayInMinutes: 0.1 });
}

function headersAutorizacao(apiToken, json = false) {
  const headers = { Authorization: `Bearer ${apiToken}` };
  return json ? { ...headers, 'Content-Type': 'application/json' } : headers;
}

function salvarExecucaoAtiva(execucao) {
  return chrome.storage.local.set({ [CHAVE_EXECUCAO_ATIVA]: execucao });
}

function limparExecucaoAtiva() {
  return chrome.storage.local.remove(CHAVE_EXECUCAO_ATIVA);
}

async function buscarComTimeout(url, opcoes = {}, timeoutMs = 45_000) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opcoes, signal: controlador.signal });
  } catch (erro) {
    if (erro?.name === 'AbortError') {
      throw new Error(`A comunicação com o sistema excedeu ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw erro;
  } finally {
    clearTimeout(temporizador);
  }
}

function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  const tamanhoBloco = 0x8000;
  for (let inicio = 0; inicio < bytes.length; inicio += tamanhoBloco) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + tamanhoBloco));
  }
  return btoa(binario);
}

async function baixarAnexos(apiUrl, apiToken, idExecucao, anexos) {
  const base = apiUrl.replace(/\/$/, '');
  const itens = anexos || [];
  const baixados = new Array(itens.length);
  let proximoIndice = 0;

  async function baixarProximo() {
    while (proximoIndice < itens.length) {
      const indice = proximoIndice++;
      const anexo = itens[indice];
      const url = `${base}/api/ext/arquivo?execucao=${encodeURIComponent(idExecucao)}&id=${encodeURIComponent(anexo.id)}`;
      const res = await buscarComTimeout(url, { headers: headersAutorizacao(apiToken) }, 90_000);
      if (!res.ok) throw new Error(`Não foi possível baixar "${anexo.nome}" (HTTP ${res.status}).`);
      baixados[indice] = {
        tipo: anexo.tipo,
        nome: anexo.nome,
        mimeType: anexo.mimeType,
        base64: paraBase64(await res.arrayBuffer()),
      };
    }
  }

  const concorrencia = Math.min(4, itens.length);
  await Promise.all(Array.from({ length: concorrencia }, () => baixarProximo()));
  return baixados;
}

async function localizarAbaGerid(tabId) {
  let abaPreferida;
  if (Number.isInteger(tabId)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (estadoDaAba(tab) === EstadoAutenticacao.AUTENTICADO) return tab;
      if (estadoDaAba(tab) !== EstadoAutenticacao.SEM_ABA) abaPreferida = tab;
    } catch {
      // A aba pode ter sido fechada; buscamos outra aberta abaixo.
    }
  }

  const abas = await chrome.tabs.query({
    url: ['*://atendimento.inss.gov.br/*', 'https://geridinss.dataprev.gov.br/*'],
  });
  const abaAutenticada = abas.find(
    (tab) => estadoDaAba(tab) === EstadoAutenticacao.AUTENTICADO,
  );
  if (abaAutenticada) return abaAutenticada;

  const aba = abaPreferida
    || abas.find((tab) => tab.active && abaDoPortalPat(tab))
    || abas.find((tab) => abaDoPortalPat(tab))
    || abas.find((tab) => tab.active)
    || abas[0];
  if (!aba?.id) throw new Error('Nenhuma aba do GERID esta aberta.');
  return aba;
}

async function lerJsonResposta(resposta, mensagemPadrao) {
  const texto = typeof resposta.text === 'function'
    ? await resposta.text()
    : typeof resposta.json === 'function'
      ? JSON.stringify(await resposta.json())
      : '{}';
  let dados;
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(`${mensagemPadrao} O servidor retornou uma resposta invalida (HTTP ${resposta.status}).`);
  }
  if (!resposta.ok) {
    throw new Error(dados.erro || dados.mensagem || `${mensagemPadrao} (HTTP ${resposta.status}).`);
  }
  return dados;
}

async function abrirAutenticacao() {
  let aba;
  let autenticado = false;
  try {
    aba = await localizarAbaGerid();
    autenticado = estadoDaAba(aba) === EstadoAutenticacao.AUTENTICADO;
    if (autenticado) {
      await chrome.tabs.update(aba.id, { active: true });
    } else {
      // Entrar pelo PAT inclui o callback do CAS. Abrir o CAS diretamente
      // termina na pagina de sucesso sem retornar ao aplicativo.
      await chrome.tabs.update(aba.id, { url: URL_REQUERIMENTOS_GERID, active: true });
    }
  } catch {
    aba = await chrome.tabs.create({ url: URL_REQUERIMENTOS_GERID, active: true });
  }
  await atualizarEstadoAutenticacao(
    autenticado ? EstadoAutenticacao.AUTENTICADO : EstadoAutenticacao.NECESSARIA,
    autenticado
      ? 'Sessao do GERID pronta.'
      : 'Abrindo o Portal de Atendimento para concluir a autenticacao.',
    aba?.id,
  );
  return aba;
}

async function aguardarAbaPronta(tabId, timeoutMs = 20_000) {
  const atual = await chrome.tabs.get(tabId);
  if (atual.status === 'complete' && atual.url?.includes('://atendimento.inss.gov.br/')) return atual;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(aoAtualizar);
      reject(new Error('A tela do Gerid demorou para ficar pronta novamente.'));
    }, timeoutMs);
    const aoAtualizar = (id, info, tab) => {
      if (id !== tabId) return;
      if (info.status === 'complete' && tab.url?.includes('://atendimento.inss.gov.br/')) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(aoAtualizar);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(aoAtualizar);
  });
}

async function prepararAbaGerid(tabId, reiniciarNoInicio = false) {
  const aba = await localizarAbaGerid(tabId);
  if (!aba.id) throw new Error('Não foi possível identificar a aba do Gerid.');

  if (estadoDaAba(aba) === EstadoAutenticacao.NECESSARIA) {
    const erro = new Error('AUTENTICACAO_GERID_NECESSARIA');
    erro.codigo = 'AUTENTICACAO_GERID_NECESSARIA';
    throw erro;
  }

  // A aba é fixada no início. Trocar a aba ativa não altera o destino do robô.
  // Se o Gerid foi recarregado ou levado a outra tela, voltamos ao ponto seguro
  // (lista de requerimentos) e recomeçamos somente o caso que ainda está pendente.
  if (reiniciarNoInicio || !aba.url?.startsWith(URL_REQUERIMENTOS_GERID)) {
    sendLog('A tela do Gerid mudou. Retomando o caso pendente pela lista de requerimentos...');
    if (reiniciarNoInicio && aba.url?.startsWith(URL_REQUERIMENTOS_GERID)) {
      // Todas as etapas do wizard usam a mesma URL. Atualizar a aba com a URL
      // que ela já possui pode ser um no-op e preservar o passo quebrado.
      // Recarregar explicitamente desmonta o estado da SPA e volta ao início.
      await chrome.tabs.reload(aba.id);
    } else {
      await chrome.tabs.update(aba.id, { url: URL_REQUERIMENTOS_GERID });
    }
    await aguardarAbaPronta(aba.id);
  }
  return aba.id;
}

async function resolverBloqueiosPortal(tabId) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let aba;
    try {
      aba = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (!abaDoPortalPat(aba) || estadoDaAba(aba) === EstadoAutenticacao.AUTENTICADO) return;

    try {
      await garantirContentScript(tabId);
      const resultados = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.resolverBloqueiosGerid?.(),
      });
      const resultado = resultados[0]?.result;
      if (resultado?.mensagem) sendLog(resultado.mensagem);
    } catch {
      // O clique pode destruir o frame durante a navegacao; reavaliamos a aba.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function enviarHeartbeat(apiUrl, apiToken, idExecucao, estadoGerid, detalheGerid) {
  if (!idExecucao) return;
  const resposta = await buscarComTimeout(apiUrl.replace(/\/$/, '') + '/api/ext/heartbeat', {
    method: 'POST',
    headers: headersAutorizacao(apiToken, true),
    body: JSON.stringify({ idExecucao, estadoGerid, detalheGerid }),
  });
  if (!resposta.ok && resposta.status !== 409) {
    throw new Error(`Nao foi possivel manter a execucao ativa (HTTP ${resposta.status}).`);
  }
}

async function buscarFila(apiUrl, apiToken) {
  const resposta = await buscarComTimeout(apiUrl.replace(/\/$/, '') + '/api/ext/fila', {
    headers: headersAutorizacao(apiToken),
  });
  const dados = await lerJsonResposta(resposta, 'Erro ao buscar a fila.');
  if (!dados.sucesso || !dados.casos) {
    throw new Error(dados.erro || 'Erro ao buscar fila.');
  }
  return dados;
}

async function prepararFila(apiUrl, apiToken) {
  const resposta = await buscarComTimeout(apiUrl.replace(/\/$/, '') + '/api/ext/iniciar', {
    method: 'POST',
    headers: headersAutorizacao(apiToken, true),
  });
  const dados = await lerJsonResposta(resposta, 'Nao foi possivel preparar a fila.');
  if (!dados.sucesso) {
    throw new Error(dados.erro || 'Nao foi possivel preparar a fila.');
  }
  return dados;
}

async function autenticacaoNecessaria(tabId) {
  try {
    return estadoDaAba(await chrome.tabs.get(tabId)) === EstadoAutenticacao.NECESSARIA;
  } catch {
    const abas = await chrome.tabs.query({ url: 'https://geridinss.dataprev.gov.br/*' });
    return abas.length > 0;
  }
}

function erroDeNavegacao(erro) {
  const texto = String(erro?.message || erro || '').toLowerCase();
  return /naveg|frame|context|recarreg|lista de servi|tela de servi|novo requerimento|script não retornou|timeout waiting|selector/.test(texto);
}

async function obterEstadoNaAba(tabId) {
  await garantirContentScript(tabId);
  const resultado = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.obterEstadoGerid?.() || { etapa: 'desconhecido', modal: null },
  });
  return resultado[0]?.result || { etapa: 'desconhecido', modal: null };
}

async function garantirContentScript(tabId) {
  const verificacao = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__GERID_RPA_CONTENT_BUILD__ === '1.5.1-20260811.9',
  });
  if (!verificacao[0]?.result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
}

async function reiniciarWizardNaAba(tabId) {
  const resultado = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.reiniciarRequerimentoGerid?.() || false,
  });
  return resultado[0]?.result === true;
}

async function executarCasoNoGerid(tabId, casoComAnexos) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      let abaId = await prepararAbaGerid(tabId, tentativa > 0);
      const estadoInicial = await obterEstadoNaAba(abaId);
      const etapaInicial = typeof estadoInicial?.etapa === 'string' ? estadoInicial.etapa : null;

      if (etapaInicial && ['passo_10', 'comprovante'].includes(etapaInicial)) {
        return {
          status: 'erro',
          erro: 'O GERID possui uma revisão ou comprovante pendente. Conclua esse caso antes de iniciar outro.',
        };
      }

      if (etapaInicial && !['lista_requerimentos', 'passo_1'].includes(etapaInicial)) {
        sendLog(`O GERID estava em ${etapaInicial}. Voltando ao início seguro antes de preencher o caso.`);
        const reiniciouWizard = await reiniciarWizardNaAba(abaId).catch(() => false);
        if (!reiniciouWizard) abaId = await prepararAbaGerid(abaId, true);
      }

      await garantirContentScript(abaId);

      const resultados = await chrome.scripting.executeScript({
        target: { tabId: abaId },
        func: async (dadosCaso) => window.iniciarProcessamento(dadosCaso),
        args: [casoComAnexos],
      });
      const resultado = resultados[0]?.result;
      if (!resultado) throw new Error('O script não retornou resultado; a página pode ter recarregado.');
      if (resultado.status === 'erro' && tentativa === 0 && erroDeNavegacao(resultado.erro)) {
        sendLog('O Gerid retornou a uma tela anterior durante o preenchimento. Vou recarregar e retomar o mesmo caso...');
        continue;
      }
      return resultado;
    } catch (erro) {
      if (erro?.codigo === 'AUTENTICACAO_GERID_NECESSARIA' || await autenticacaoNecessaria(tabId)) {
        return {
          status: 'autenticacao',
          erro: 'A sessao do GERID expirou. Conclua o SafeID e o codigo do autenticador.',
        };
      }
      if (tentativa === 0 && erroDeNavegacao(erro)) {
        sendLog('O Gerid mudou de tela durante o preenchimento. Vou recuperar o mesmo caso sem perder a fila...');
        continue;
      }
      return { status: 'erro', erro: `Erro na execução do Gerid: ${erro?.message || erro}` };
    }
  }
  return { status: 'erro', erro: 'Não foi possível retomar o caso no Gerid.' };
}

async function enviarResultado(apiUrl, apiToken, idExecucao, caso, resultado) {
  sendLog(`Enviando resultado do ${caso.nome}: ${resultado.status}` + (resultado.erro ? ` - ${resultado.erro}` : ''));
  const resposta = await buscarComTimeout(apiUrl.replace(/\/$/, '') + '/api/ext/status', {
    method: 'POST',
    headers: headersAutorizacao(apiToken, true),
    body: JSON.stringify({
      idExecucao,
      cpf: caso.cpf,
      status: resultado.status,
      motivoErro: resultado.erro,
      protocolo: resultado.protocolo,
      pdfBase64: resultado.pdfBase64,
      pdfNome: resultado.pdfNome,
    }),
  });
  await lerJsonResposta(resposta, 'Nao foi possivel registrar o resultado.');
}

async function detectarProtocoloNaAba(tabId) {
  const verificacao = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => typeof window.detectarProtocoloGerid === 'function',
  });
  if (!verificacao[0]?.result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
  const resultado = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.detectarProtocoloGerid?.() || null,
  });
  return resultado[0]?.result || null;
}

/** Registra o protocolo depois que o operador confirma e continua a fila. */
async function verificarConfirmacaoPendente(tabIdPreferido) {
  const dados = await chrome.storage.local.get([
    CHAVE_EXECUCAO_ATIVA,
    'apiUrl',
    'apiToken',
    'modoTeste',
  ]);
  const ativa = dados[CHAVE_EXECUCAO_ATIVA];
  if (!ativa?.aguardandoConfirmacao || !dados.apiUrl || !dados.apiToken) return false;
  if (isRunning) return true;

  let aba;
  try {
    aba = await localizarAbaGerid(tabIdPreferido || ativa.geridTabId);
  } catch {
    aba = await abrirAutenticacao();
  }

  if (!aba?.id || estadoDaAba(aba) !== EstadoAutenticacao.AUTENTICADO) {
    await enviarHeartbeat(
      dados.apiUrl,
      dados.apiToken,
      ativa.idExecucao,
      'autenticacao_necessaria',
      'Reautentique para concluir a captura do protocolo.',
    );
    agendarRetomadaAutenticacao();
    return true;
  }

  try {
    const protocolo = await detectarProtocoloNaAba(aba.id);
    if (!protocolo) {
      await enviarHeartbeat(
        dados.apiUrl,
        dados.apiToken,
        ativa.idExecucao,
        'aguardando_confirmacao',
        `Revise e confirme o requerimento de ${ativa.nomeAtual || 'cliente atual'} no GERID.`,
      );
      agendarVerificacaoConfirmacao();
      return true;
    }

    isRunning = true;
    await enviarResultado(
      dados.apiUrl,
      dados.apiToken,
      ativa.idExecucao,
      { cpf: ativa.cpfAtual, nome: ativa.nomeAtual || 'Cliente' },
      { status: 'sucesso', protocolo },
    );
    sendLog(`Protocolo ${protocolo} registrado com sucesso.`);
    await salvarExecucaoAtiva({ ...ativa, aguardandoConfirmacao: false, geridTabId: aba.id });
    if (ativa.modoTeste !== false) {
      sendLog('Modo teste concluido. Desative-o e inicie novamente para processar toda a fila.');
      await limparExecucaoAtiva();
      isRunning = false;
      return true;
    }
    sendLog('Continuando a fila...');
    await processQueue(
      dados.apiUrl,
      dados.apiToken,
      ativa.modoTeste !== false,
      aba.id,
      Number(ativa.tentativasRetomada) || 0,
      false,
    );
    return true;
  } catch (erro) {
    isRunning = false;
    sendLog(`Ainda nao foi possivel registrar o protocolo: ${erro?.message || erro}`);
    agendarVerificacaoConfirmacao();
    return true;
  }
}

function erroDefinitivoDoRequerente(resultado) {
  if (resultado?.status !== 'erro') return false;
  const texto = String(resultado.erro || '').toLowerCase();
  // Só um bloqueio inequívoco do próprio Gerid encerra automaticamente o caso.
  // Falhas de tela, rede ou mapeamento precisam permanecer pendentes para retry.
  return /pedido\s+\d+.*em aberto|existe pedido em aberto|cpf inv[aá]lido/.test(texto);
}

async function processQueue(
  apiUrl,
  apiToken,
  modoTeste,
  tabIdPreferido,
  tentativasRetomada = 0,
  iniciarSeVazia = false,
) {
  let manterExecucaoPendente = false;
  try {
    if (!apiToken) throw new Error('A chave da extensão não foi informada.');
    sendLog('Iniciando processamento...');
    let data = await buscarFila(apiUrl, apiToken);
    if ((!data.idExecucao || data.casos.length === 0) && iniciarSeVazia) {
      sendLog('Preparando a fila no servidor...');
      await prepararFila(apiUrl, apiToken);
      data = await buscarFila(apiUrl, apiToken);
    }

    const casos = modoTeste ? data.casos.slice(0, 1) : data.casos;
    if (casos.length === 0 || !data.idExecucao) {
      sendLog('Não há casos pendentes na fila.');
      return;
    }

    let aba;
    try {
      aba = await localizarAbaGerid(tabIdPreferido);
    } catch {
      aba = await abrirAutenticacao();
    }

    if (aba?.id && abaDoPortalPat(aba)) {
      await resolverBloqueiosPortal(aba.id);
      aba = await chrome.tabs.get(aba.id);
    }

    await salvarExecucaoAtiva({
      idExecucao: data.idExecucao,
      geridTabId: aba?.id,
      modoTeste,
      tentativasRetomada,
      iniciadoEm: new Date().toISOString(),
    });

    if (!aba?.id || estadoDaAba(aba) !== EstadoAutenticacao.AUTENTICADO) {
      manterExecucaoPendente = true;
      if (aba?.id && !abaDoPortalPat(aba)) {
        await abrirAutenticacao();
      }
      await enviarHeartbeat(
        apiUrl,
        apiToken,
        data.idExecucao,
        'autenticacao_necessaria',
        'Aguardando SafeID e codigo do autenticador.',
      );
      await atualizarEstadoAutenticacao(
        EstadoAutenticacao.NECESSARIA,
        'Aguardando SafeID e codigo do autenticador.',
        aba?.id,
      );
      await avisarAutenticacaoNecessaria();
      agendarRetomadaAutenticacao();
      sendLog('Aguardando autenticacao. A fila sera retomada automaticamente.');
      return;
    }

    await atualizarEstadoAutenticacao(
      EstadoAutenticacao.AUTENTICADO,
      'Sessao do GERID pronta.',
      aba.id,
    );
    await enviarHeartbeat(apiUrl, apiToken, data.idExecucao, 'autenticado');
    sendLog(modoTeste
      ? `Modo teste: processando 1 de ${data.casos.length} caso(s) pendente(s).`
      : `Fila carregada: ${casos.length} casos pendentes.`);

    for (const caso of casos) {
      await salvarExecucaoAtiva({
        idExecucao: data.idExecucao,
        geridTabId: aba.id,
        modoTeste,
        cpfAtual: caso.cpf,
        nomeAtual: caso.nome,
        tentativasRetomada,
        iniciadoEm: new Date().toISOString(),
      });
      sendLog(`Processando: ${caso.nome}`);
      await enviarHeartbeat(
        apiUrl,
        apiToken,
        data.idExecucao,
        'processando',
        `Processando ${caso.nome}.`,
      );
      const casoComAnexos = {
        ...caso,
        anexos: await baixarAnexos(apiUrl, apiToken, data.idExecucao, caso.anexos),
      };
      const resultado = await executarCasoNoGerid(aba.id, casoComAnexos);

      if (resultado.status === 'autenticacao') {
        manterExecucaoPendente = true;
        await salvarExecucaoAtiva({
          idExecucao: data.idExecucao,
          geridTabId: aba.id,
          modoTeste,
          cpfAtual: caso.cpf,
          nomeAtual: caso.nome,
          tentativasRetomada,
          iniciadoEm: new Date().toISOString(),
        });
        await enviarHeartbeat(
          apiUrl,
          apiToken,
          data.idExecucao,
          'autenticacao_necessaria',
          resultado.erro,
        );
        await atualizarEstadoAutenticacao(EstadoAutenticacao.NECESSARIA, resultado.erro, aba.id);
        await avisarAutenticacaoNecessaria();
        agendarRetomadaAutenticacao();
        sendLog('Sessao expirada. Conclua a autenticacao; a fila sera retomada sozinha.');
        break;
      }

      if (resultado.status === 'erro' && !erroDefinitivoDoRequerente(resultado)) {
        const proximaTentativa = tentativasRetomada + 1;
        manterExecucaoPendente = true;
        await salvarExecucaoAtiva({
          idExecucao: data.idExecucao,
          geridTabId: aba.id,
          modoTeste,
          cpfAtual: caso.cpf,
          nomeAtual: caso.nome,
          tentativasRetomada: proximaTentativa,
          iniciadoEm: new Date().toISOString(),
        });
        sendLog(
          `Pausa técnica no caso ${caso.nome}. Ele continua na fila para retomar após a correção: ${resultado.erro}`,
        );
        if (proximaTentativa <= MAX_RETOMADAS_AUTOMATICAS && chrome.alarms?.create) {
          chrome.alarms.create(ALARME_RETOMADA, { delayInMinutes: 0.1 });
          sendLog(`Retomada automática agendada (${proximaTentativa}/${MAX_RETOMADAS_AUTOMATICAS}).`);
        } else {
          sendLog('A execução continua preservada. Abra a extensão e clique em Iniciar para tentar novamente.');
        }
        break;
      }
      // Grave a parada local antes da chamada ao servidor. Se a rede cair
      // exatamente aqui, a tela preenchida e o CPF atual continuam recuperaveis.
      if (resultado.status === 'revisao') {
        manterExecucaoPendente = true;
        await salvarExecucaoAtiva({
          idExecucao: data.idExecucao,
          geridTabId: aba.id,
          modoTeste,
          cpfAtual: caso.cpf,
          nomeAtual: caso.nome,
          aguardandoConfirmacao: true,
          tentativasRetomada,
          iniciadoEm: new Date().toISOString(),
        });
      }

      await enviarResultado(apiUrl, apiToken, data.idExecucao, caso, resultado);

      // Revisão é uma parada intencional: preserva a tela preenchida para o
      // operador e nunca abre outro requerimento por cima dela.
      if (resultado.status === 'revisao') {
        await enviarHeartbeat(
          apiUrl,
          apiToken,
          data.idExecucao,
          'aguardando_confirmacao',
          `Revise e confirme o requerimento de ${caso.nome} no GERID.`,
        );
        agendarVerificacaoConfirmacao();
        sendLog(modoTeste
          ? 'Revise e confirme no GERID. O protocolo deste caso de teste sera capturado automaticamente.'
          : 'Revise e confirme no GERID. Depois do clique, o protocolo sera capturado e a fila continuara.');
        break;
      }
    }
  } catch (erro) {
    sendLog(`Erro fatal: ${erro?.message || erro}`);
    const salvo = await chrome.storage.local.get([CHAVE_EXECUCAO_ATIVA]).catch(() => ({}));
    const ativa = salvo[CHAVE_EXECUCAO_ATIVA];
    if (ativa?.idExecucao) {
      manterExecucaoPendente = true;
      const proximaTentativa = (Number(ativa.tentativasRetomada) || 0) + 1;
      await salvarExecucaoAtiva({ ...ativa, tentativasRetomada: proximaTentativa });
      if (proximaTentativa <= MAX_RETOMADAS_AUTOMATICAS && chrome.alarms?.create) {
        chrome.alarms.create(ALARME_RETOMADA, { delayInMinutes: 0.25 });
        sendLog(`Nova tentativa automatica agendada (${proximaTentativa}/${MAX_RETOMADAS_AUTOMATICAS}).`);
      } else {
        sendLog('A fila foi preservada. Abra a extensao e clique em Iniciar para tentar novamente.');
      }
    }
  } finally {
    isRunning = false;
    if (!manterExecucaoPendente) await limparExecucaoAtiva();
    chrome.runtime.sendMessage({ action: 'finished' }).catch(() => {});
  }
}

async function retomarExecucaoPersistida() {
  if (isRunning) return;
  const dados = await chrome.storage.local.get([
    CHAVE_EXECUCAO_ATIVA,
    'apiUrl',
    'apiToken',
    'modoTeste',
  ]);
  if (isRunning) return;
  const ativa = dados[CHAVE_EXECUCAO_ATIVA];
  if (!ativa || !dados.apiUrl || !dados.apiToken) return;
  if (ativa.aguardandoConfirmacao) {
    void verificarConfirmacaoPendente(ativa.geridTabId);
    return;
  }

  isRunning = true;
  sendLog('Recuperei uma execução pendente. Retomando em segundo plano...');
  void processQueue(
    dados.apiUrl,
    dados.apiToken,
    ativa.modoTeste !== false,
    ativa.geridTabId,
    Number(ativa.tentativasRetomada) || 0,
  );
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'start') {
    if (isRunning) {
      sendLog('Já existe um processamento em andamento. A fila e a aba do Gerid foram preservadas.');
      return;
    }
    isRunning = true;
    const modoTeste = request.modoTeste !== false;
    void chrome.storage.local
      .set({ apiUrl: request.apiUrl, apiToken: request.apiToken, modoTeste })
      .then(async () => {
        const salvo = await chrome.storage.local.get([CHAVE_EXECUCAO_ATIVA]);
        if (salvo[CHAVE_EXECUCAO_ATIVA]?.aguardandoConfirmacao) {
          isRunning = false;
          await verificarConfirmacaoPendente(salvo[CHAVE_EXECUCAO_ATIVA].geridTabId);
          return;
        }
        await processQueue(request.apiUrl, request.apiToken, modoTeste, undefined, 0, true);
      })
      .catch((erro) => {
        isRunning = false;
        sendLog(`Nao foi possivel iniciar: ${erro?.message || erro}`);
      });
  }
  if (request.action === 'open_auth') {
    void abrirAutenticacao();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'content_log') sendLog(msg.message);
});

chrome.runtime.onStartup.addListener(() => {
  void sincronizarAutorizacaoDoPainel();
  void retomarExecucaoPersistida();
});
chrome.runtime.onInstalled?.addListener(() => {
  void sincronizarAutorizacaoDoPainel();
  void retomarExecucaoPersistida();
});
chrome.alarms?.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_CONFIRMACAO) {
    void verificarConfirmacaoPendente();
  } else if (alarme.name === ALARME_RETOMADA || alarme.name === ALARME_AUTENTICACAO) {
    void retomarExecucaoPersistida();
  }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url && info.status !== 'complete') return;
  const estado = estadoDaAba({ ...tab, url: info.url || tab.url });
  if (estado === EstadoAutenticacao.NECESSARIA) {
    if (abaDoPortalPat({ ...tab, url: info.url || tab.url }) && info.status === 'complete') {
      void atualizarEstadoAutenticacao(
        estado,
        'Concluindo autorizacao de abrangencia e papel no PAT.',
        tabId,
      ).then(() => resolverBloqueiosPortal(tabId))
        .then(async () => {
          const atual = await chrome.tabs.get(tabId);
          if (estadoDaAba(atual) !== EstadoAutenticacao.AUTENTICADO) return;
          await atualizarEstadoAutenticacao(
            EstadoAutenticacao.AUTENTICADO,
            'Sessao do GERID pronta.',
            tabId,
          );
          await retomarExecucaoPersistida();
        });
      return;
    }
    void atualizarEstadoAutenticacao(
      estado,
      'Conclua o SafeID e informe o codigo de 6 digitos do GERID.',
      tabId,
    );
    return;
  }
  if (estado === EstadoAutenticacao.AUTENTICADO && info.status === 'complete') {
    void atualizarEstadoAutenticacao(estado, 'Sessao do GERID pronta.', tabId)
      .then(() => verificarConfirmacaoPendente(tabId))
      .then((aguardandoConfirmacao) => {
        if (!aguardandoConfirmacao) return retomarExecucaoPersistida();
      });
  }
});
void retomarExecucaoPersistida();
