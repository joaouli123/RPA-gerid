const URL_REQUERIMENTOS_GERID = 'https://atendimento.inss.gov.br/requerimentos';
const URL_LOGIN_GERID = 'https://geridinss.dataprev.gov.br/';
const URL_PAINEL_RPA = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';
const CHAVE_EXECUCAO_ATIVA = 'execucaoAtivaGerid';
const CHAVE_ESTADO_AUTENTICACAO = 'estadoAutenticacaoGerid';
const CHAVE_ULTIMO_AVISO_AUTENTICACAO = 'ultimoAvisoAutenticacaoGerid';
const CHAVE_ULTIMO_CERTIFICADO = 'ultimoPedidoCertificadoGerid';
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

/**
 * Tela "Codigo numerico" do CAS — o segundo fator, depois do SafeID.
 *
 * O robo NAO tem a semente do Google Authenticator e nunca vai ter: quem le os
 * 6 digitos e o operador, no celular dele. Aqui a extensao so faz o transporte
 * — avisa o painel, o painel chama o operador no WhatsApp, o operador responde
 * os digitos, e a extensao digita no campo. O codigo vive segundos, so em
 * memoria, e nunca entra em log nem em storage.
 *
 * O botao "Reiniciar Dispositivo MFA" fica ao lado do "Entrar" nessa mesma
 * tela. Ele nao e tocado em lugar nenhum deste arquivo: clicar por engano
 * desparearia o autenticador do titular, e ai ninguem mais entra.
 *
 * Devolve true quando assumiu a tela (com ou sem sucesso) — o chamador entao
 * nao mexe no botao de certificado, que e de outra etapa.
 */
let mfaEmAndamento = false;

async function resolverCodigoMfa(tabId, apiUrl, apiToken) {
  if (!tabId || mfaEmAndamento) return mfaEmAndamento;

  let tela = '';
  try {
    const saida = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (document.querySelector('#main-frame-error')) return 'site_fora';
        const campo = document.querySelector('#token, input[name="token"]');
        const enviar = document.querySelector('input[name="_eventId_submit"]');
        if (!campo || !enviar || !campo.offsetParent) return 'sem_tela';
        // Campo ja preenchido: o proprio operador esta digitando na frente do
        // computador. Sobrescrever atrapalharia quem esta resolvendo na mao.
        if (String(campo.value || '').trim()) return 'operador_digitando';
        return 'pedir';
      },
    });
    tela = saida?.[0]?.result || '';
  } catch {
    return false;
  }

  if (tela === 'operador_digitando') return true;
  if (tela !== 'pedir') return false;

  if (!apiUrl || !apiToken) {
    sendLog(
      'O GERID pediu o codigo de 6 digitos, mas a extensao ainda nao tem o painel '
      + 'configurado para pedir por WhatsApp. Digite o codigo voce mesmo.',
    );
    return true;
  }

  mfaEmAndamento = true;
  try {
    const base = apiUrl.replace(/\/$/, '');
    let desafio = '';
    try {
      const resposta = await buscarComTimeout(`${base}/api/ext/login-2fa`, {
        method: 'POST',
        headers: headersAutorizacao(apiToken, true),
      });
      const dados = await lerJsonResposta(resposta, 'Nao consegui pedir o codigo.');
      if (!dados.sucesso || !dados.desafio) throw new Error(dados.erro || 'Nao consegui pedir o codigo.');
      desafio = dados.desafio;
    } catch (erro) {
      sendLog(`Nao consegui pedir o codigo pelo WhatsApp: ${erro?.message || erro}. Digite o codigo voce mesmo.`);
      return true;
    }

    sendLog('Pedi o codigo de 6 digitos no seu WhatsApp. Responda so os digitos — eu digito aqui.');

    // O desafio expira em 2 minutos no servidor; paramos junto para nao ficar
    // perguntando por um codigo que ja nao vale.
    const limite = Date.now() + 115 * 1000;
    let codigo = null;
    while (Date.now() < limite && !codigo) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const resposta = await buscarComTimeout(
          `${base}/api/ext/login-2fa?desafio=${encodeURIComponent(desafio)}`,
          { headers: headersAutorizacao(apiToken) },
        );
        const dados = await lerJsonResposta(resposta, 'Erro ao buscar o codigo.');
        if (dados.codigo) codigo = String(dados.codigo);
        else if (dados.sucesso && !dados.aguardando && !dados.segundosRestantes) break;
      } catch {
        // Rede oscilando nao encerra a espera: o operador pode estar digitando.
      }
    }

    if (!codigo) {
      sendLog('O codigo nao chegou a tempo. Digite os 6 digitos na tela ou inicie a fila de novo.');
      return true;
    }

    let resultado = '';
    try {
      const saida = await chrome.scripting.executeScript({
        target: { tabId },
        args: [codigo],
        func: (digitos) => {
          const campo = document.querySelector('#token, input[name="token"]');
          // So o submit "Entrar". NUNCA _eventId_requestDeviceReset.
          const enviar = document.querySelector('input[name="_eventId_submit"]');
          if (!campo || !enviar) return 'sem_tela';
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          campo.focus();
          if (setter) setter.call(campo, digitos);
          else campo.value = digitos;
          campo.dispatchEvent(new Event('input', { bubbles: true }));
          campo.dispatchEvent(new Event('change', { bubbles: true }));
          enviar.click();
          return 'enviado';
        },
      });
      resultado = saida?.[0]?.result || '';
    } catch {
      resultado = '';
    }
    // `codigo` sai de escopo aqui e nunca foi para log, storage nem heartbeat.

    sendLog(resultado === 'enviado'
      ? 'Codigo informado no GERID. A fila retoma sozinha.'
      : 'Recebi o codigo mas a tela mudou antes de digitar. Vou pedir de novo se precisar.');
    return true;
  } finally {
    mfaEmAndamento = false;
  }
}

/**
 * Aperta "Entrar com Certificado Digital" na tela de login do CAS.
 *
 * Esse botao nao autentica ninguem: ele so faz o SafeID mandar a notificacao
 * para o celular do titular, que autoriza (ou nao) no aparelho dele. Ou seja,
 * o robo adianta o clique burocratico e o segundo fator continua inteiro, na
 * mao da pessoa. Sem isto a fila fica parada esperando alguem lembrar de
 * clicar, mesmo com o operador na frente do computador.
 *
 * O que este codigo NUNCA faz: tocar em #username ou #password. Senha e
 * digitada pelo titular, ponto. Nao ha ramo aqui que preencha credencial.
 */
async function pedirAutorizacaoNoCelular(tabId, apiUrl, apiToken) {
  if (!tabId) return;

  // A tela dos 6 digitos vem DEPOIS do SafeID, dentro da janela de 3 minutos do
  // debounce abaixo. Se ela fosse checada depois, o robo sairia calado
  // justamente na etapa em que ele tem o que fazer.
  if (await resolverCodigoMfa(tabId, apiUrl, apiToken)) return;

  const salvo = await chrome.storage.local.get([CHAVE_ULTIMO_CERTIFICADO]);
  // A notificacao do SafeID vale ~3 min. Clicar de novo antes disso derruba a
  // solicitacao que ja esta no celular do titular e enche o aparelho de push.
  if (Date.now() - Number(salvo[CHAVE_ULTIMO_CERTIFICADO] || 0) < 3 * 60 * 1000) return;

  let resultado = '';
  try {
    const saida = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Pagina de erro do proprio Chrome (ERR_CONNECTION_TIMED_OUT e afins).
        // Ela fica na MESMA url do GERID, entao sem olhar o conteudo o robo
        // conclui "precisa autenticar" quando na verdade o Dataprev e que nao
        // respondeu — e manda o operador procurar SafeID que nunca vai chegar.
        if (document.querySelector('#main-frame-error')) return 'site_fora';
        const botao = document.querySelector('#botaoCertificadoDigital');
        if (!botao || botao.disabled || !botao.offsetParent) return 'sem_botao';
        // Ja existe uma solicitacao no celular esperando resposta: clicar de
        // novo cancelaria a que a pessoa talvez esteja abrindo agora. O trecho
        // procurado para de proposito antes de "solicitacao" — assim nao
        // depende de acento e dispensa normalizar a pagina inteira.
        const texto = String(document.body?.innerText || '').toLowerCase();
        if (texto.includes('autorize a solicit')) return 'ja_aguardando';
        botao.click();
        return 'disparado';
      },
    });
    resultado = saida?.[0]?.result || '';
  } catch {
    return;
  }

  if (resultado === 'disparado') {
    await chrome.storage.local.set({ [CHAVE_ULTIMO_CERTIFICADO]: Date.now() });
    sendLog('Pedi o certificado digital: autorize no SafeID do seu celular. A fila retoma sozinha.');
  } else if (resultado === 'ja_aguardando') {
    sendLog('Ja existe uma solicitacao do SafeID no seu celular. Autorize por la.');
  } else if (resultado === 'site_fora') {
    sendLog(
      'O GERID (Dataprev) nao respondeu — o site esta fora do ar ou instavel. '
      + 'Nao e login nem sessao: nao adianta autenticar. A fila tenta de novo sozinha.',
    );
  }
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
  if (!idExecucao) return null;
  const resposta = await buscarComTimeout(apiUrl.replace(/\/$/, '') + '/api/ext/heartbeat', {
    method: 'POST',
    headers: headersAutorizacao(apiToken, true),
    body: JSON.stringify({ idExecucao, estadoGerid, detalheGerid }),
  });
  if (!resposta.ok && resposta.status !== 409) {
    throw new Error(`Nao foi possivel manter a execucao ativa (HTTP ${resposta.status}).`);
  }
  // O corpo carrega a pausa pedida no painel. Um heartbeat sem corpo legivel
  // (409, resposta vazia) devolve null e o chamador simplesmente segue — nunca
  // interpretar "nao sei" como "pausado".
  try {
    return typeof resposta.json === 'function' ? await resposta.json() : null;
  } catch {
    return null;
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
  const verificacaoIsolada = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__GERID_RPA_CONTENT_BUILD__ === '1.6.0-20260811.1',
  });
  if (!verificacaoIsolada[0]?.result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }

  const verificacaoPrincipal = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => window.__GERID_RPA_CONTENT_BUILD__ === '1.6.0-20260811.1',
  });
  if (!verificacaoPrincipal[0]?.result) {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['content.js'],
    });
  }
}

async function acionarControleReact(tabId, tipo, id, valor) {
  let ultimoResultado = { ok: false, motivo: 'sem_resultado' };

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const resultados = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [tipo, id, valor],
      func: async (tipoControle, idControle, valorDesejado) => {
        const normalizar = (texto) => String(texto || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        const obterPropsReact = (elemento) => {
          if (!elemento) return null;
          const nomes = Object.getOwnPropertyNames(elemento);
          const chaveProps = nomes.find((nome) => nome.startsWith('__reactProps$'));
          if (chaveProps) return elemento[chaveProps];
          const chaveFiber = nomes.find((nome) => nome.startsWith('__reactFiber$'));
          let fiber = chaveFiber ? elemento[chaveFiber] : null;
          for (let nivel = 0; fiber && nivel < 4; nivel++, fiber = fiber.return) {
            if (fiber.memoizedProps) return fiber.memoizedProps;
          }
          return null;
        };
        const criarEvento = (elemento, tipoEvento, value) => {
          let cancelado = false;
          return {
            type: tipoEvento,
            target: value === undefined ? elemento : { value },
            currentTarget: elemento,
            nativeEvent: null,
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            preventDefault() { cancelado = true; },
            stopPropagation() {},
            persist() {},
            isDefaultPrevented() { return cancelado; },
            isPropagationStopped() { return false; },
          };
        };
        const textosDaOpcao = (item) => {
          const label = item.querySelector('label');
          return [
            label?.querySelector('[aria-hidden="true"] > div')?.textContent,
            label?.querySelector('div')?.textContent,
            label?.getAttribute('aria-label'),
            label?.innerText,
            label?.textContent,
          ].filter((texto) => Boolean(texto?.trim()));
        };
        const esperar = async (validar, timeoutMs = 1_500) => {
          const limite = Date.now() + timeoutMs;
          do {
            if (validar()) return true;
            await new Promise((resolve) => setTimeout(resolve, 25));
          } while (Date.now() < limite);
          return validar();
        };

        if (tipoControle === 'combobox') {
          const combo = document.getElementById(idControle);
          const lista = document.getElementById(`${idControle}-itens`);
          if (!combo || !lista) return { ok: false, motivo: 'controle_nao_encontrado' };

          const alvo = normalizar(valorDesejado);
          const item = Array.from(lista.querySelectorAll('.br-item')).find((opcao) =>
            textosDaOpcao(opcao).some((texto) => {
              const candidato = normalizar(texto);
              return candidato === alvo || candidato.startsWith(alvo);
            }),
          );
          if (!item) return { ok: false, motivo: 'opcao_nao_encontrada' };

          let mecanismo = 'evento';
          const valorOpcao = item.querySelector('input[type="radio"]')?.value;
          const propsCombo = obterPropsReact(combo);
          const propsItem = obterPropsReact(item);
          try {
            if (valorOpcao && typeof propsCombo?.onChange === 'function') {
              propsCombo.onChange(criarEvento(combo, 'change', valorOpcao));
              mecanismo = 'react_onchange';
            } else if (typeof propsItem?.onMouseDown === 'function') {
              propsItem.onMouseDown(criarEvento(item, 'mousedown'));
              mecanismo = 'react_mousedown';
            } else if (typeof propsItem?.onKeyDown === 'function') {
              propsItem.onKeyDown({ ...criarEvento(item, 'keydown'), key: 'Enter' });
              mecanismo = 'react_teclado';
            } else {
              item.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                composed: true,
                button: 0,
                buttons: 1,
                view: window,
              }));
            }
          } catch (erro) {
            return { ok: false, motivo: `handler_falhou:${erro?.message || String(erro)}` };
          }

          const confirmou = await esperar(
            () => normalizar(document.getElementById(idControle)?.value) === alvo,
          );
          return { ok: confirmou, motivo: confirmou ? mecanismo : `${mecanismo}_nao_confirmado` };
        }

        if (tipoControle === 'marcar') {
          const input = document.getElementById(idControle);
          const controle = input?.closest('.interaction-select');
          if (!input || !controle) return { ok: false, motivo: 'controle_nao_encontrado' };
          if (input.checked) return { ok: true, motivo: 'ja_marcado' };

          let mecanismo = 'evento';
          const props = obterPropsReact(controle);
          try {
            if (typeof props?.onClick === 'function') {
              props.onClick(criarEvento(controle, 'click'));
              mecanismo = 'react_click';
            } else if (typeof props?.onKeyDown === 'function') {
              props.onKeyDown({ ...criarEvento(controle, 'keydown'), key: 'Enter' });
              mecanismo = 'react_teclado';
            } else {
              controle.click();
            }
          } catch (erro) {
            return { ok: false, motivo: `handler_falhou:${erro?.message || String(erro)}` };
          }

          const confirmou = await esperar(
            () => document.getElementById(idControle)?.checked === true,
          );
          return { ok: confirmou, motivo: confirmou ? mecanismo : `${mecanismo}_nao_confirmado` };
        }

        return { ok: false, motivo: 'tipo_invalido' };
      },
    });
    ultimoResultado = resultados[0]?.result || { ok: false, motivo: 'sem_resultado' };
    if (ultimoResultado.ok) return ultimoResultado;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return ultimoResultado;
}

/**
 * O requerimento aberto na tela é deste caso? Devolve 'sim' | 'nao' | 'indefinido'.
 * Só 'sim' autoriza retomar — continuar o requerimento de outra pessoa
 * protocolaria dado de um cliente no nome de outro.
 */
async function requerimentoEhDoCaso(tabId, caso) {
  const resultado = await chrome.scripting.executeScript({
    target: { tabId },
    func: (cpf, nome) => window.requerimentoAbertoEhDoCaso?.(cpf, nome) || 'indefinido',
    args: [String(caso?.cpf || ''), String(caso?.nome || '')],
  }).catch(() => null);
  return resultado?.[0]?.result || 'indefinido';
}

/** Etapas do meio do wizard: já tem dado dentro, ainda dá para continuar. */
const ETAPAS_RETOMAVEIS = ['passo_2', 'passo_3', 'passo_4', 'passo_5', 'passo_6', 'passo_7', 'passo_8', 'passo_9'];

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
        // Antes de jogar fora o que já está preenchido, pergunte de quem é.
        // Voltar ao passo 1 com o requerimento do PRÓPRIO caso aberto era o que
        // fazia o robô "recomeçar do zero" — e travar na segunda tentativa,
        // porque o GERID recusa dado repetido.
        const dono = ETAPAS_RETOMAVEIS.includes(etapaInicial)
          ? await requerimentoEhDoCaso(abaId, casoComAnexos)
          : 'nao';

        if (dono === 'sim') {
          sendLog(`O requerimento de ${casoComAnexos.nome} já estava aberto em ${etapaInicial}. Retomando de onde parou.`);
        } else {
          const porque = dono === 'indefinido'
            ? 'não consegui confirmar de quem é o requerimento aberto'
            : 'o requerimento aberto é de outra pessoa';
          sendLog(`O GERID estava em ${etapaInicial} e ${porque}. Voltando ao início seguro antes de preencher o caso.`);
          const reiniciouWizard = await reiniciarWizardNaAba(abaId).catch(() => false);
          if (!reiniciouWizard) abaId = await prepararAbaGerid(abaId, true);
        }
      }

      await garantirContentScript(abaId);

      const resultados = await chrome.scripting.executeScript({
        target: { tabId: abaId },
        world: 'MAIN',
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

// ---------------------------------------------------------------------------
// Lista oficial de tarefas — a unica prova de que o requerimento entrou
// ---------------------------------------------------------------------------
//
// O robo ja chegou a protocolar SEM saber: o modal "Seu requerimento ainda nao
// foi finalizado..." cobriu a tela do comprovante, o numero nunca apareceu, o
// caso foi marcado como falha e a rodada seguinte tentou refazer — a que o
// GERID respondeu "O pedido 1555659503 ainda esta em aberto".
//
// Perguntar a lista (/tarefas) resolve os dois lados: confirma o protocolo que
// existe de verdade e evita um segundo requerimento no nome da mesma pessoa.
// E de la que sai o comprovante em PDF ("Acoes > Gerar Comprovante").

const URL_TAREFAS = 'https://atendimento.inss.gov.br/tarefas';

/** dd/MM/aaaa no fuso do operador — e assim que a coluna "Protocolado em" vem. */
function dataDeHojeBR() {
  const agora = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()}`;
}

/**
 * Abre /tarefas numa aba PROPRIA, em segundo plano.
 *
 * Reaproveitar a aba do wizard destruiria o requerimento preenchido — inclusive
 * um que ainda esteja aguardando revisao humana.
 */
async function abrirAbaTarefas() {
  // Sem as APIs de aba nao ha como consultar a lista sem destruir o wizard.
  if (typeof chrome?.tabs?.create !== 'function' || typeof chrome?.scripting?.executeScript !== 'function') {
    throw new Error('Este navegador nao expos chrome.tabs/chrome.scripting para a extensao.');
  }
  const aba = await chrome.tabs.create({ url: URL_TAREFAS, active: false });
  const limite = Date.now() + 45000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 400));
    const atual = await chrome.tabs.get(aba.id).catch(() => null);
    if (!atual) throw new Error('A aba da lista de tarefas foi fechada antes de carregar.');
    if (atual.status === 'complete') {
      // A tabela vem por XHR depois do "complete"; o script de busca espera por ela.
      await new Promise((r) => setTimeout(r, 1200));
      return aba.id;
    }
  }
  throw new Error('A lista de tarefas do GERID nao carregou a tempo.');
}

/** Filtra a lista por CPF e devolve as linhas encontradas. */
async function buscarLinhasNaLista(tabId, cpf) {
  const saida = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [String(cpf || '').replace(/\D/g, '')],
    func: async (cpfDigitos) => {
      const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
      const dig = (v) => (v || '').replace(/\D/g, '');
      const norm = (v) => (v || '').replace(/\s+/g, ' ').trim();
      const esperar = async (achar, ms) => {
        const fim = Date.now() + ms;
        for (;;) {
          let achado = null;
          try { achado = achar(); } catch (e) { achado = null; }
          if (achado) return achado;
          if (Date.now() >= fim) return null;
          await dormir(250);
        }
      };

      const campo = await esperar(
        () => document.querySelector('#filtro-entidade-conveniada-cpf'),
        25000,
      );
      if (!campo) return { erro: 'Nao encontrei o filtro de CPF na lista de tarefas.' };

      // O input e controlado pelo React: mexer no .value direto nao dispara o
      // onChange, e o clique em Buscar sairia com o filtro vazio.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )?.set;
      if (setter) setter.call(campo, cpfDigitos); else campo.value = cpfDigitos;
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      await dormir(400);

      // Ha DOIS botoes "Buscar" na tela (Requerimentos e Cumprimento de
      // Exigencia). O escopo #requerimento e o que separa um do outro.
      const buscar = Array.from(document.querySelectorAll('#requerimento button'))
        .find((b) => norm(b.textContent).toLowerCase() === 'buscar');
      if (!buscar) return { erro: 'Nao encontrei o botao Buscar na lista de tarefas.' };

      const lerLinhas = () => Array.from(
        document.querySelectorAll('#tableConsultarTarefasEC tbody tr'),
      )
        .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => norm(td.innerText)))
        // A linha "Nenhum registro encontrado" e um td unico com colspan.
        .filter((c) => c.length >= 8)
        .map((c) => ({
          protocolo: dig(c[0]), servico: c[1], nome: c[2], cpf: dig(c[3]),
          protocoladoEm: c[4], unidade: c[5], situacao: c[6], atualizadoEm: c[7],
        }));

      const antes = lerLinhas().map((l) => l.protocolo).join(',');
      buscar.click();

      // A busca vai ao servidor. So aceita quando a tabela inteira for do CPF
      // pedido: enquanto vier linha de outra pessoa, o resultado ainda e o antigo.
      const filtradas = await esperar(() => {
        const linhas = lerLinhas();
        if (!linhas.length) return null;
        if (!linhas.every((l) => l.cpf === cpfDigitos)) return null;
        return linhas;
      }, 25000);
      if (filtradas) return { linhas: filtradas };

      // O filtro pode nao ter pegado. Em vez de desistir, aproveita o que esta
      // na tela — a linha certa continua sendo a que tem este CPF.
      const naTela = lerLinhas().filter((l) => l.cpf === cpfDigitos);
      if (naTela.length) {
        return { linhas: naTela, aviso: 'O filtro de CPF nao pegou; li a linha direto da tabela.' };
      }
      return {
        linhas: [],
        aviso: antes === lerLinhas().map((l) => l.protocolo).join(',')
          ? 'A lista nao mudou depois do Buscar; pode nao ter filtrado.'
          : 'A lista do GERID nao trouxe nenhuma linha para este CPF.',
      };
    },
  });
  return saida[0]?.result || { erro: 'A lista de tarefas nao respondeu.' };
}

/**
 * Pede "Gerar Comprovante" na linha do protocolo e captura o PDF.
 *
 * O GERID monta o arquivo NO NAVEGADOR e manda baixar. Sem interceptar, o PDF
 * so existiria solto na pasta Downloads, que a extensao nao consegue ler — e o
 * comprovante nunca chegaria a pasta do cliente. Por isso os tres ganchos:
 * `fetch` (resposta application/pdf), `URL.createObjectURL` (blob -> <a download>)
 * e `<a href="data:...">`. O GERID so precisa usar UM deles.
 */
async function gerarComprovanteNaLista(tabId, protocolo) {
  const saida = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [String(protocolo || '').replace(/\D/g, '')],
    func: async (protocoloAlvo) => {
      const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
      const norm = (v) => (v || '').replace(/\s+/g, ' ').trim();
      const esperar = async (achar, ms) => {
        const fim = Date.now() + ms;
        for (;;) {
          let achado = null;
          try { achado = achar(); } catch (e) { achado = null; }
          if (achado) return achado;
          if (Date.now() >= fim) return null;
          await dormir(200);
        }
      };

      const g = window;
      if (!g.__geridCapturaPdf) {
        g.__geridCapturaPdf = { blob: null, dataUrl: '' };
        const criarUrl = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (obj) {
          try { if (obj instanceof Blob) g.__geridCapturaPdf.blob = obj; } catch (e) {}
          return criarUrl(obj);
        };
        const fetchOriginal = g.fetch;
        g.fetch = async function (...args) {
          const resposta = await fetchOriginal.apply(this, args);
          try {
            const tipo = resposta.headers.get('content-type') || '';
            if (/pdf|octet-stream/i.test(tipo)) {
              g.__geridCapturaPdf.blob = await resposta.clone().blob();
            }
          } catch (e) {}
          return resposta;
        };
        const cliqueOriginal = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          try {
            if (typeof this.href === 'string' && this.href.startsWith('data:')) {
              g.__geridCapturaPdf.dataUrl = this.href;
            }
          } catch (e) {}
          return cliqueOriginal.call(this);
        };
      }
      g.__geridCapturaPdf.blob = null;
      g.__geridCapturaPdf.dataUrl = '';

      const linha = Array.from(
        document.querySelectorAll('#tableConsultarTarefasEC tbody tr'),
      ).find((tr) => {
        const primeira = tr.querySelector('td');
        return primeira && norm(primeira.innerText).replace(/\D/g, '') === protocoloAlvo;
      });
      if (!linha) return { erro: `Nao achei a linha do protocolo ${protocoloAlvo} na lista.` };

      const acoes = linha.querySelector('button[aria-label="Ações"], button[aria-label="Acoes"]');
      if (!acoes) return { erro: 'Nao achei o botao de acoes da linha.' };
      acoes.click();
      await dormir(300);

      // Procura o item DENTRO da propria linha: buscar no documento inteiro
      // pegaria o menu de outra linha que tenha ficado aberto.
      const gerar = await esperar(
        () => Array.from(linha.querySelectorAll('button'))
          .find((b) => norm(b.textContent).toLowerCase() === 'gerar comprovante'),
        6000,
      );
      if (!gerar) return { erro: 'O menu da linha nao mostrou "Gerar Comprovante".' };
      gerar.click();

      const captura = await esperar(
        () => (g.__geridCapturaPdf.blob || g.__geridCapturaPdf.dataUrl) ? g.__geridCapturaPdf : null,
        25000,
      );
      if (!captura) return { erro: 'Pedi o comprovante, mas nao consegui capturar o arquivo.' };

      if (captura.dataUrl) {
        const base64 = captura.dataUrl.split(',')[1] || '';
        return base64
          ? { pdfBase64: base64, bytes: Math.round(base64.length * 0.75) }
          : { erro: 'O link do comprovante veio vazio.' };
      }

      const base64 = await new Promise((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
        leitor.onerror = () => resolve('');
        leitor.readAsDataURL(captura.blob);
      });
      return base64
        ? { pdfBase64: base64, bytes: captura.blob.size }
        : { erro: 'Nao consegui ler o arquivo do comprovante.' };
    },
  });
  return saida[0]?.result || { erro: 'A tela do comprovante nao respondeu.' };
}

/**
 * Confere na lista do GERID o que realmente aconteceu com este caso e, quando
 * ha protocolo, traz o comprovante em PDF.
 *
 * MUTA `resultado` de proposito: e ele que segue para `/api/ext/status`.
 *
 * Regra de seguranca para PROMOVER um caso a sucesso sem que o robo tenha lido
 * o numero na tela: a linha precisa ser de HOJE. Um requerimento antigo da mesma
 * pessoa (BPC negado ano passado, por exemplo) esta na lista tambem, e usa-lo
 * marcaria como protocolado um caso que nunca foi enviado.
 */
/**
 * O numero que o PROPRIO GERID citou ao recusar o servico.
 *
 * "Nao e possivel continuar com este servico: O pedido 1555659503 ainda esta em
 * aberto." Ler esse numero e o oposto de inventar dado — e o portal dizendo qual
 * requerimento ja existe para este CPF. Sem isso o robo trataria como ERRO um
 * caso que na verdade JA FOI protocolado, e tentaria de novo na proxima rodada.
 */
function protocoloCitadoNoBloqueio(texto) {
  const limpo = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return /pedido\s+(\d{6,})[^.]{0,40}?em aberto/i.exec(limpo)?.[1] || '';
}

/**
 * Caso que o GERID diz JA TER — vira sucesso com o numero dele, nunca erro.
 *
 * O motivo original nao e apagado: fica no historico ao lado da explicacao, para
 * o operador entender por que o robo parou de tentar este CPF.
 */
function promoverAJaProtocolado(resultado, protocolo, detalhe) {
  resultado.status = 'sucesso';
  resultado.protocolo = protocolo;
  resultado.erro = [
    resultado.erro,
    `Na verdade JA ESTAVA protocolado: ${protocolo} (${detalhe}). ` +
    'Nao refiz o requerimento.',
  ].filter(Boolean).join(' | ');
}

async function conferirNaListaDeTarefas(caso, resultado) {
  const lidoNaTela = String(resultado.protocolo || '').replace(/\D/g, '');
  // O bloqueio "pedido X em aberto" pode chegar aqui como ERRO: se o alerta
  // sumiu antes do robo reler a tela, o numero sobrou so no texto da falha.
  const citadoNoBloqueio = lidoNaTela ? '' : protocoloCitadoNoBloqueio(resultado.erro);
  const jaTem = lidoNaTela || citadoNoBloqueio;
  let tabId = null;
  try {
    tabId = await abrirAbaTarefas();
    const busca = await buscarLinhasNaLista(tabId, caso.cpf);
    if (busca.erro) {
      sendLog(`Nao consegui conferir na lista do GERID: ${busca.erro}`);
      return;
    }
    if (busca.aviso) sendLog(`Lista de tarefas: ${busca.aviso}`);

    const linhas = busca.linhas || [];
    const hoje = dataDeHojeBR();
    const escolhida = jaTem
      ? linhas.find((l) => l.protocolo === jaTem)
      : linhas.find((l) => l.protocoladoEm === hoje);

    if (!escolhida) {
      if (citadoNoBloqueio) {
        // Quem nomeou este numero foi o proprio GERID, ao recusar o servico
        // para ESTE CPF. Nao achar a linha na lista costuma ser filtro de
        // periodo (protocolo de outro dia), nao ausencia do requerimento.
        // Deixar como erro faria o robo tentar de novo amanha — e cada
        // tentativa e um requerimento a mais no nome de uma pessoa real.
        promoverAJaProtocolado(resultado, citadoNoBloqueio,
          'nao localizei a linha na lista (possivel filtro de periodo), entao o comprovante ficou faltando');
        sendLog(
          `${caso.nome} JA ESTAVA protocolado (${citadoNoBloqueio}) — o GERID recusou refazer. ` +
          'Nao achei a linha na lista para gerar o comprovante; baixe pela tela de Tarefas.',
        );
      } else if (jaTem) {
        sendLog(`O protocolo ${jaTem} nao apareceu na lista; sigo com o numero lido na tela.`);
      } else {
        sendLog(
          `A lista do GERID nao mostra requerimento de hoje para ${caso.nome}` +
          `${linhas.length ? ` (${linhas.length} anterior(es) no periodo)` : ''}. Nada foi protocolado.`,
        );
      }
      return;
    }

    if (!lidoNaTela) {
      promoverAJaProtocolado(
        resultado,
        escolhida.protocolo,
        `${escolhida.servico}, ${escolhida.situacao}, protocolado em ${escolhida.protocoladoEm}`,
      );
      sendLog(`${caso.nome}: a lista do GERID confirma o protocolo ${escolhida.protocolo}.`);
    }

    const pdf = await gerarComprovanteNaLista(tabId, escolhida.protocolo);
    if (pdf.pdfBase64) {
      resultado.pdfBase64 = pdf.pdfBase64;
      resultado.pdfNome = `comprovante ${escolhida.protocolo}.pdf`;
      sendLog(`Comprovante do protocolo ${escolhida.protocolo} capturado (${pdf.bytes} bytes).`);
    } else {
      // Falhar aqui NAO invalida o protocolo: o requerimento entrou do mesmo
      // jeito, so o arquivo ficou faltando. Por isso vira aviso, nao erro.
      sendLog(`Nao consegui baixar o comprovante: ${pdf.erro || 'motivo desconhecido'}`);
      resultado.erro = [resultado.erro, `Comprovante nao capturado: ${pdf.erro || 'motivo desconhecido'}.`]
        .filter(Boolean).join(' | ');
    }
  } catch (erro) {
    sendLog(`Falha ao consultar a lista de tarefas: ${erro?.message || erro}`);
  } finally {
    // Fechar a aba e limpeza, nao resultado. Se o usuario ja fechou na mao (ou o
    // navegador nem expoe `remove`), estourar aqui derrubaria o caso INTEIRO —
    // inclusive um caso que acabou de ser protocolado com sucesso.
    if (tabId !== null && tabId !== undefined) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (falhaAoFechar) {
        sendLog(`Nao consegui fechar a aba da lista de tarefas: ${falhaAoFechar?.message || falhaAoFechar}`);
      }
    }
  }
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
  const registrado = await lerJsonResposta(resposta, 'Nao foi possivel registrar o resultado.');

  // Conferencia explicita do comprovante. O operador pediu para SABER se o
  // arquivo chegou aos dois destinos, e nao adianta a extensao dizer "capturei":
  // quem sabe se o PDF virou arquivo e o servidor. Falta aqui nao invalida o
  // protocolo — o requerimento entrou de qualquer jeito; vira aviso.
  if (resultado.pdfBase64) {
    const conferido = registrado?.comprovante;
    if (!conferido) {
      sendLog('Enviei o comprovante, mas o painel nao confirmou onde salvou. Confira na tela de Execucao.');
    } else if (conferido.painel && conferido.drive) {
      sendLog(`Comprovante de ${caso.nome} confirmado no painel E no Drive do cliente.`);
    } else if (conferido.painel || conferido.drive) {
      // Meio caminho nao e "deu certo". O pedido e o arquivo nos DOIS lugares, e
      // o destino que faltou e sempre o Drive na pratica (a service account nao
      // tem cota para criar arquivo). Dizer "confirmado" aqui faria o operador
      // fechar o caso sem o comprovante na pasta do cliente.
      const entrou = conferido.painel ? 'painel' : 'Drive do cliente';
      const faltou = conferido.painel ? 'Drive do cliente' : 'painel';
      sendLog(
        `ATENCAO: o comprovante de ${caso.nome} entrou no ${entrou} mas NAO no ${faltou}. ` +
        `${conferido.aviso || ''}`.trim(),
      );
    } else {
      sendLog(`ATENCAO: o comprovante de ${caso.nome} NAO foi salvo. ${conferido.aviso || ''}`.trim());
    }
  }
}

async function detectarProtocoloNaAba(tabId, cpf, nome) {
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
  const protocolo = resultado[0]?.result || null;
  if (!protocolo) return null;

  // De quem e o comprovante que esta na tela? Um numero lido do comprovante de
  // OUTRA pessoa entraria na planilha como se fosse deste caso. "nao" e um
  // reconhecimento negativo (ha outro CPF na tela) e barra; "indefinido" so
  // significa que a tela nao mostra dono, e ai o numero e aceito com registro.
  const dono = await chrome.scripting.executeScript({
    target: { tabId },
    func: (cpfAlvo, nomeAlvo) => window.requerimentoAbertoEhDoCaso?.(cpfAlvo, nomeAlvo) || 'indefinido',
    args: [String(cpf || ''), String(nome || '')],
  }).then((r) => r[0]?.result).catch(() => 'indefinido');

  if (dono === 'nao') {
    sendLog(
      `Ignorei um numero de protocolo na tela: o comprovante aberto NAO e de ${nome || 'cliente atual'}.`,
    );
    return null;
  }
  if (dono !== 'sim') {
    sendLog(`Protocolo capturado numa tela que nao identifica o titular — confira o comprovante de ${nome || 'cliente atual'}.`);
  }
  return protocolo;
}

/** Em que etapa do wizard a aba esta. `null` quando nao da para saber. */
async function etapaDaAba(tabId) {
  try {
    const resultado = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.obterEstadoGerid?.()?.etapa || null,
    });
    return resultado[0]?.result || null;
  } catch {
    return null;
  }
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
    const protocolo = await detectarProtocoloNaAba(aba.id, ativa.cpfAtual, ativa.nomeAtual);
    if (!protocolo) {
      // A tela que estava esperando confirmacao SUMIU: o wizard voltou para a
      // primeira etapa ou para a lista. Continuar esperando ali e esperar para
      // sempre — foi o que travou a extensao em "Aguardando confirmacao" sem
      // nunca iniciar outra run. Solta o cadeado e devolve a decisao ao humano.
      //
      // Nao retoma a fila sozinho de proposito: daqui nao da para saber se o
      // requerimento chegou a ser protocolado antes de a tela ser trocada, e
      // refazer no escuro protocolaria o mesmo pedido duas vezes.
      const etapa = await etapaDaAba(aba.id);
      if (etapa === 'passo_1' || etapa === 'lista_requerimentos') {
        await limparExecucaoAtiva();
        sendLog(
          `A tela do requerimento de ${ativa.nomeAtual || 'cliente atual'} nao esta mais aberta ` +
          `(GERID em ${etapa}), entao parei de esperar a confirmacao. ` +
          'CONFIRA no GERID se esse requerimento ja foi protocolado ANTES de rodar a fila de novo.',
        );
        chrome.runtime.sendMessage({ action: 'finished' }).catch(() => {});
        return true;
      }

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

    // Pausa pedida no painel: nem abre o GERID. A execucao continua viva e os
    // casos continuam pendentes, entao `manterExecucaoPendente` segue falso de
    // proposito — nao ha caso em andamento para preservar.
    //
    // A checagem vem ANTES de `prepararFila`: com a fila pausada o servidor
    // devolve `casos: []`, o que parecia "fila vazia" e fazia um clique em
    // Iniciar mandar preparar fila nova — furando justamente a pausa.
    if (data.pausada) {
      sendLog('Fila PAUSADA no painel. Clique em Retomar fila no painel para continuar.');
      return;
    }

    if ((!data.idExecucao || data.casos.length === 0) && iniciarSeVazia) {
      sendLog('Preparando a fila no servidor...');
      await prepararFila(apiUrl, apiToken);
      data = await buscarFila(apiUrl, apiToken);
      if (data.pausada) {
        sendLog('Fila PAUSADA no painel. Clique em Retomar fila no painel para continuar.');
        return;
      }
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
      await pedirAutorizacaoNoCelular(aba?.id, apiUrl, apiToken);
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
      // Este heartbeat e tambem o ponto onde a extensao descobre a pausa. Ele
      // acontece ANTES de qualquer coisa do proximo caso: a pausa so vale
      // ENTRE casos, porque parar no meio deixaria um requerimento pela metade
      // na tela — ou, pior, pararia logo depois do Confirmar, sem ler o
      // protocolo, que foi exatamente o que aconteceu com a Camila.
      const sinal = await enviarHeartbeat(
        apiUrl,
        apiToken,
        data.idExecucao,
        'processando',
        `Proximo caso: ${caso.nome}.`,
      );
      if (sinal?.pausada) {
        manterExecucaoPendente = true;
        await salvarExecucaoAtiva({
          idExecucao: data.idExecucao,
          geridTabId: aba.id,
          modoTeste,
          tentativasRetomada,
          iniciadoEm: new Date().toISOString(),
        });
        sendLog(
          `Fila PAUSADA no painel. ${caso.nome} nao foi iniciado e continua na fila. ` +
          'Clique em Retomar fila no painel e depois em Iniciar aqui.',
        );
        break;
      }

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
      const casoComAnexos = {
        ...caso,
        anexos: await baixarAnexos(apiUrl, apiToken, data.idExecucao, caso.anexos),
      };
      const resultado = await executarCasoNoGerid(aba.id, casoComAnexos);

      // Sessao morta: a lista tambem nao carregaria. Nos outros casos sempre
      // pergunta ao GERID — inclusive no sucesso, porque e de la que vem o PDF.
      if (resultado.status !== 'autenticacao') {
        await conferirNaListaDeTarefas(caso, resultado);
      }

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
        await pedirAutorizacaoNoCelular(aba.id, apiUrl, apiToken);
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

      // O robô concluiu sozinho (passo 10) e o GERID devolveu o número. Não há
      // o que esperar de humano: segue para o próximo caso da fila.
      if (resultado.status === 'sucesso') {
        sendLog(`${caso.nome}: PROTOCOLADO — ${resultado.protocolo}`);
        continue;
      }

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'gerid_react_control') return undefined;
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, motivo: 'aba_nao_identificada' });
    return undefined;
  }
  void acionarControleReact(tabId, request.tipo, request.id, request.valor)
    .then(sendResponse)
    .catch((erro) => sendResponse({
      ok: false,
      motivo: erro?.message || String(erro),
    }));
  return true;
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
