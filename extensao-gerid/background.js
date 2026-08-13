const URL_REQUERIMENTOS_GERID = 'https://atendimento.inss.gov.br/requerimentos';
const URL_LOGIN_GERID = 'https://geridinss.dataprev.gov.br/';
const URL_PAINEL_RPA = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';
const CHAVE_EXECUCAO_ATIVA = 'execucaoAtivaGerid';
const CHAVE_ESTADO_AUTENTICACAO = 'estadoAutenticacaoGerid';
const CHAVE_ULTIMO_AVISO_AUTENTICACAO = 'ultimoAvisoAutenticacaoGerid';
const CHAVE_ULTIMO_CERTIFICADO = 'ultimoPedidoCertificadoGerid';
const CHAVE_LOGS = 'logsGerid';
const CHAVE_ULTIMO_RELATO_RONDA = 'ultimoRelatoRondaGerid';
const ALARME_RETOMADA = 'retomarExecucaoGerid';
const ALARME_AUTENTICACAO = 'aguardarAutenticacaoGerid';
const ALARME_CONFIRMACAO = 'verificarConfirmacaoGerid';
const ALARME_RONDA = 'rondaContinuaGerid';
const MAX_RETOMADAS_AUTOMATICAS = 3;
/**
 * De quanto em quanto tempo o robo olha se apareceu trabalho novo.
 *
 * Cinco minutos porque e o intervalo que some na operacao: o escritorio faz da
 * ordem de 5 protocolos por dia, entao uma pasta nova esperar no maximo cinco
 * minutos nao atrasa ninguem. Mais curto que isso seria bater no Drive e no
 * GERID dezenas de vezes por hora para nao encontrar nada — e insistencia
 * automatizada contra sistema do INSS e exatamente o que acorda o antiabuso da
 * Dataprev. Mais longo faria o operador achar que o robo morreu.
 */
const RONDA_MINUTOS = 5;
/**
 * Ate quando esperar a tela mostrar o protocolo antes de desistir.
 *
 * Existe porque a espera nao tinha fim: o alarme reagendava a cada 6 segundos e,
 * se a aba nao soubesse dizer em que etapa estava, ninguem nunca soltava o
 * cadeado. Dez minutos e muito mais do que confirmar um requerimento leva, e
 * bem menos do que "para sempre".
 */
const LIMITE_ESPERA_CONFIRMACAO_MS = 10 * 60 * 1000;
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

/**
 * O host da url, sem porta — ou string vazia se nao for url.
 *
 * Existe porque comparar url com `includes('://host/')` quebra em porta
 * explicita: o CAS do GERID atende em `geridinss.dataprev.gov.br:8443`, que NAO
 * contem `geridinss.dataprev.gov.br/`. O efeito era mudo e caro: a aba do login
 * era classificada como SEM_ABA, e o ramo que pede o codigo de 6 digitos no
 * WhatsApp nunca rodava. Ninguem pedia nada, e a leitura obvia era "o WhatsApp
 * nao funciona" — quando o problema era uma comparacao de texto.
 */
function hostDaUrl(url) {
  try {
    return new URL(String(url || '')).hostname;
  } catch {
    return '';
  }
}

function ehHostGerid(url) {
  return hostDaUrl(url) === 'geridinss.dataprev.gov.br';
}

function ehHostPat(url) {
  return hostDaUrl(url) === 'atendimento.inss.gov.br';
}

function estadoDaAba(tab) {
  const url = String(tab?.url || '');
  if (ehHostGerid(url)) return EstadoAutenticacao.NECESSARIA;
  if (ehHostPat(url)) {
    // O caminho — nao a url inteira. Pelo mesmo motivo do host: porta, query e
    // fragmento nao podem decidir se a sessao esta valida.
    let caminho = '';
    try { caminho = new URL(url).pathname; } catch { caminho = ''; }
    if (/^\/(tarefas|requerimentos)(?:\/|$)/i.test(caminho)) {
      return EstadoAutenticacao.AUTENTICADO;
    }
    return EstadoAutenticacao.NECESSARIA;
  }
  return EstadoAutenticacao.SEM_ABA;
}

/**
 * A tela "Solucao de Protecao de Sistemas" da Dataprev.
 *
 * Ela vem na MESMA url do INSS, com HTTP 200, entao nada no nivel de rede
 * denuncia o bloqueio: para o robo e uma pagina como outra qualquer, e ele
 * seguiria tentando. Insistir contra antiabuso e como ele confirma que do
 * outro lado tem um robo — o recuo aqui nao e educacao, e autopreservacao do
 * acesso do escritorio.
 *
 * Nada neste caminho tenta disfarcar nada. Ele para, registra a ocorrencia e
 * devolve a decisao para uma pessoa.
 */
async function bloqueioAntiabuso(tabId) {
  if (!tabId) return null;
  try {
    const saida = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const texto = String(document.body?.innerText || '').toLowerCase();
        // Sem acento no trecho procurado: "solucao"/"solução" e "protecao"/
        // "proteção" mudam conforme a fonte, e normalizar a pagina inteira a
        // cada verificacao sairia caro para nada.
        const bloqueado = texto.includes('prote')
          && texto.includes('de sistemas')
          && texto.includes('considerada suspeita');
        if (!bloqueado) return null;
        // O numero no rodape e a identificacao da ocorrencia — e a unica coisa
        // que a Dataprev reconhece se alguem precisar reclamar depois.
        const ocorrencia = (document.body.innerText.match(/\b\d{12,}\b/) || [''])[0];
        return { bloqueado: true, ocorrencia };
      },
    });
    // Confere a FORMA da resposta, nao so se veio algo. Esta funcao decide
    // parar a fila inteira; um `true` solto vindo de outro caminho — ou de um
    // executeScript que respondeu qualquer coisa — nao pode ter esse poder.
    const r = saida?.[0]?.result;
    return r && typeof r === 'object' && r.bloqueado === true ? r : null;
  } catch {
    return null;
  }
}

function abaDoPortalPat(tab) {
  return ehHostPat(tab?.url);
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

/**
 * O estado de autenticacao que estava salvo ANTES desta atualizacao de aba.
 *
 * Serve para separar "acabou de logar" de "ja estava logado e mudou de tela".
 * O listener de `tabs.onUpdated` dispara em toda pagina do PAT que termina de
 * carregar, e durante uma fila em andamento sao dezenas — sem essa comparacao,
 * "iniciar depois do login" viraria "iniciar a cada clique".
 */
async function estadoAutenticacaoSalvo() {
  const salvo = await chrome.storage.local.get([CHAVE_ESTADO_AUTENTICACAO]).catch(() => ({}));
  return salvo?.[CHAVE_ESTADO_AUTENTICACAO]?.estado || null;
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
  //
  // Isto saia CALADO, e o silencio era o pior dos dois mundos: o operador via a
  // tela de login parada, o botao intocado e nenhuma linha no log — a leitura
  // obvia e "a extensao nao tentou". Ela tentou; ela se conteve. Agora diz.
  const desde = Date.now() - Number(salvo[CHAVE_ULTIMO_CERTIFICADO] || 0);
  if (desde < 3 * 60 * 1000) {
    sendLog(
      `Ja pedi o certificado ha ${Math.round(desde / 1000)}s e a solicitacao ainda vale. `
      + 'Autorize no SafeID do celular. Para forcar um novo pedido, clique em Abrir autenticacao.',
    );
    return;
  }

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

/**
 * Credenciais do painel guardadas pelo bootstrap. Devolve vazio sem reclamar:
 * quem chama trata a ausencia (o pedido do certificado funciona sem elas; so o
 * codigo de 6 digitos por WhatsApp e que precisa).
 */
async function credenciaisPainel() {
  const salvo = await chrome.storage.local.get(['apiUrl', 'apiToken']).catch(() => ({}));
  return { apiUrl: salvo?.apiUrl || '', apiToken: salvo?.apiToken || '' };
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
    const erro = new Error(dados.erro || dados.mensagem || `${mensagemPadrao} (HTTP ${resposta.status}).`);
    // O status e o codigo sobrevivem ao `throw`. Sem isso, quem chama so tem o
    // TEXTO da mensagem para decidir o que fazer — e "nada a protocolar hoje"
    // ficaria indistinguivel de "o servidor caiu", que e a diferenca entre
    // esperar em paz e acender um alarme.
    erro.status = resposta.status;
    if (dados.codigo) erro.codigo = dados.codigo;
    throw erro;
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
  if (atual.status === 'complete' && ehHostPat(atual.url)) return atual;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(aoAtualizar);
      reject(new Error('A tela do Gerid demorou para ficar pronta novamente.'));
    }, timeoutMs);
    const aoAtualizar = (id, info, tab) => {
      if (id !== tabId) return;
      if (info.status === 'complete' && ehHostPat(tab.url)) {
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

/**
 * Fila sem caso pendente: explica QUEM ficou de fora, nome por nome.
 *
 * "Nao ha casos pendentes na fila." sozinho e verdade e engana ao mesmo tempo.
 * Quem esta olhando a extensao ve o cliente na pasta do Drive, ve que ele nao
 * foi protocolado, le "zerado" e conclui que o robo nem chegou a conferir. Na
 * maioria das vezes o robo conferiu: o caso travou em erro/revisao e ficou
 * esperando uma decisao humana que ninguem sabia que era necessaria.
 *
 * Sao tres saidas diferentes e cada uma pede uma acao diferente do operador —
 * reenfileirar, nao mexer, ou cadastrar pasta nova. Juntar as tres num texto so
 * mandaria o operador procurar no lugar errado.
 */
function relatarFilaVazia(data, silencioso = false) {
  const parados = Array.isArray(data?.parados) ? data.parados : [];
  const pulados = Array.isArray(data?.pulados) ? data.pulados : [];
  const linhas = [];

  if (parados.length) {
    linhas.push(`Nada pendente, mas ${parados.length} caso(s) travaram e estao esperando voce:`);
    for (const c of parados) {
      const motivo = c.status === 'revisao' ? 'revisao manual' : c.motivoErro || 'erro';
      linhas.push(`  - ${c.nome}: ${motivo}`);
    }
    linhas.push('Abra Execucao no painel e clique em Reenfileirar para tentar de novo.');
  }

  if (pulados.length) {
    // Nao e falha: e a trava que impede abrir um segundo requerimento no nome
    // da mesma pessoa. O numero vai junto para o operador poder conferir no
    // GERID se o protocolo atribuido e mesmo daquele cliente.
    linhas.push(`${pulados.length} cliente(s) fora da fila por ja terem protocolo:`);
    for (const p of pulados) linhas.push(`  - ${p.nome}: protocolo ${p.protocolo}`);
  }

  if (!linhas.length) linhas.push('Nao ha casos pendentes na fila.');

  // Na ronda isto e a resposta NORMAL, repetida a cada cinco minutos. Vai por
  // `relatarRonda`, que so escreve quando o texto muda.
  if (silencioso) return relatarRonda(linhas.join('\n'));
  for (const linha of linhas) sendLog(linha);
  return Promise.resolve();
}

/**
 * Diz algo UMA vez por mudanca, e nao uma vez por ronda.
 *
 * A ronda roda a cada cinco minutos, para sempre. Num dia sem pasta nova sao
 * mais de cem passadas e todas tem a mesma coisa verdadeira a dizer: nao ha o
 * que protocolar. Repetir isso cem vezes nao informa nada e ainda empurra para
 * fora do historico (MAX_LOGS = 80) as linhas que importam — as do protocolo
 * que deu certo de manha. Entao so a MUDANCA de situacao vira log.
 *
 * O marcador e limpo por `esquecerRelatoDaRonda()` sempre que o robo realmente
 * trabalha, para que a volta ao repouso seja anunciada de novo em vez de ficar
 * escondida atras do texto identico de horas antes.
 */
async function relatarRonda(mensagem) {
  const salvo = await chrome.storage.local.get([CHAVE_ULTIMO_RELATO_RONDA]).catch(() => ({}));
  if (salvo?.[CHAVE_ULTIMO_RELATO_RONDA] === mensagem) return;
  await chrome.storage.local.set({ [CHAVE_ULTIMO_RELATO_RONDA]: mensagem }).catch(() => undefined);
  sendLog(mensagem);
}

function esquecerRelatoDaRonda() {
  return chrome.storage.local.remove(CHAVE_ULTIMO_RELATO_RONDA).catch(() => undefined);
}

/**
 * Conta ao servidor o que deu errado, para alguem poder corrigir depois.
 *
 * O log da extensao cabe 80 linhas e vive so nesta maquina. O robo trabalha o
 * dia inteiro sem ninguem olhando, entao e certo que as situacoes novas — a
 * tela que mudou, o PDF que nao baixou — aconteçam quando nao ha ninguem na
 * frente do computador. Sem esta linha, na quinta-feira nao existe mais nenhum
 * registro do que quebrou na terca.
 *
 * Engole o proprio erro de proposito: e chamado de dentro de um `catch`, e uma
 * falha ao anotar o problema nao pode virar um segundo problema por cima.
 */
async function registrarErroNoPainel(apiUrl, apiToken, dados) {
  if (!apiUrl || !apiToken) return;
  try {
    await buscarComTimeout(
      apiUrl.replace(/\/$/, '') + '/api/ext/erro',
      {
        method: 'POST',
        headers: headersAutorizacao(apiToken, true),
        body: JSON.stringify(dados),
      },
      10_000,
    );
  } catch {
    // Sem rede para o painel nao ha o que fazer aqui. O log local ja tem a linha.
  }
}

/**
 * Devolve `{ semTrabalho: true }` quando nao ha o que protocolar agora.
 *
 * Nao ter cliente novo NAO e erro — e o estado normal da maior parte do dia. O
 * servidor recusa com 422 nos dois casos, e antes disso virava excecao: a ronda
 * cairia no `catch` de erro fatal a cada cinco minutos, gastaria as tentativas
 * de retomada e encheria o log de alarme falso num dia em que nada aconteceu.
 */
async function prepararFila(apiUrl, apiToken) {
  try {
    const resposta = await buscarComTimeout(apiUrl.replace(/\/$/, '') + '/api/ext/iniciar', {
      method: 'POST',
      headers: headersAutorizacao(apiToken, true),
    });
    const dados = await lerJsonResposta(resposta, 'Nao foi possivel preparar a fila.');
    if (!dados.sucesso) {
      throw new Error(dados.erro || 'Nao foi possivel preparar a fila.');
    }
    return dados;
  } catch (erro) {
    if (erro?.codigo === 'sem_trabalho') {
      return { semTrabalho: true, motivo: erro.message || 'Nada a protocolar agora.' };
    }
    throw erro;
  }
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

/**
 * O build do content.js que este background espera encontrar na aba.
 *
 * A conferencia e por VERSAO, e nao por "tem content script ai?", porque aba
 * aberta antes da atualizacao continua com o content.js ANTIGO carregado — e
 * ele responde a tudo normalmente, so que com o codigo de ontem.
 *
 * ⚠️ Tem que ser igual ao CONTENT_BUILD_ID de src/index.ts (e do content.js
 * gerado). Se divergir, a comparacao falha SEMPRE e o content.js e reinjetado a
 * cada chamada — o guard para de guardar e vira so trabalho repetido. O teste
 * `extensaoBuildContent` quebra se os dois sairem de sincronia.
 */
const BUILD_CONTENT_ESPERADO = '1.6.0-20260812.29';

async function garantirContentScript(tabId) {
  const verificacaoIsolada = await chrome.scripting.executeScript({
    target: { tabId },
    args: [BUILD_CONTENT_ESPERADO],
    func: (esperado) => window.__GERID_RPA_CONTENT_BUILD__ === esperado,
  });
  if (!verificacaoIsolada[0]?.result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }

  const verificacaoPrincipal = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [BUILD_CONTENT_ESPERADO],
    func: (esperado) => window.__GERID_RPA_CONTENT_BUILD__ === esperado,
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

/**
 * Devolve a aba a um estado onde o PROXIMO cliente pode comecar.
 *
 * So faz sentido depois de um caso que falhou: a essa altura o GERID ja foi
 * consultado (tela de detalhe e lista de tarefas) e disse que nao ha
 * requerimento, entao o que sobrou na tela e formulario pela metade — jogar
 * fora nao perde protocolo nenhum.
 *
 * ⚠️ Nao serve para caso em REVISAO. Ali a tela preenchida e justamente o que o
 * operador vai conferir, e limpar seria apagar o trabalho na frente dele.
 */
async function limparAbaParaProximoCaso(tabId, { requerimentoConcluido = false } = {}) {
  const etapa = await etapaDaAba(tabId);
  if (!etapa || ['lista_requerimentos', 'passo_1'].includes(etapa)) return true;

  // Passo 10 e comprovante sao telas de requerimento JA ENVIADO ou prestes a
  // ser. Sem o numero na mao nao se limpa isso por conta propria: pode haver
  // pedido em voo, e o proximo caso espera.
  //
  // COM o numero registrado e o comprovante ja capturado, nao ha mais nada em
  // voo — a tela virou recibo do que terminou. Ficar parado nela foi exatamente
  // o que aconteceu depois do primeiro protocolo real: o robo concluiu, salvou
  // tudo, e estacionou no detalhe da tarefa em vez de chamar o proximo cliente.
  if (!requerimentoConcluido && ['passo_10', 'comprovante'].includes(etapa)) return false;

  if (await reiniciarWizardNaAba(tabId).catch(() => false)) return true;
  try {
    await prepararAbaGerid(tabId, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deixa a aba em condicao de atender o PROXIMO cliente. Devolve a aba a usar
 * dali em diante, ou null quando nem trocar de aba resolveu.
 *
 * ⚠️ So pode ser chamado onde ja se sabe que NAO ha requerimento em voo: caso
 * que falhou (a essa altura o GERID ja foi consultado e disse que nao existe) ou
 * pedido que o portal RECUSOU. Nos dois, o que sobrou na tela e formulario pela
 * metade e jogar fora nao perde protocolo nenhum.
 *
 * A aba nova existe porque parar a fila inteira era caro demais para o que
 * estava em jogo. Uma tela emperrada — modal de bloqueio por cima do passo 2,
 * por exemplo — fazia o robo desistir dos outros clientes do dia, que nem
 * chegavam a ser tentados. Aba nova nasce limpa e nao herda o que travou a
 * antiga; a fila so para se ate isso falhar.
 */
async function abaProntaParaProximoCaso(aba, opcoes) {
  if (await limparAbaParaProximoCaso(aba.id, opcoes).catch(() => false)) return aba;

  const etapa = await etapaDaAba(aba.id).catch(() => null);
  try {
    const nova = await chrome.tabs.create({ url: URL_REQUERIMENTOS_GERID, active: true });
    await aguardarAbaPronta(nova.id);
    // Fechar a antiga DEPOIS de a nova estar de pe: se ela fosse a ultima aba
    // da janela, fechar primeiro levaria a janela junto.
    await chrome.tabs.remove(aba.id).catch(() => {});
    sendLog(
      `O GERID ficou preso em ${etapa || 'tela desconhecida'} e nao voltou ao inicio. ` +
      'Abri uma aba nova do GERID e sigo com o proximo cliente.',
    );
    return nova;
  } catch {
    return null;
  }
}

/**
 * "A pagina recarregou" ou "o requerimento ENTROU e o GERID mudou de tela"?
 *
 * Sao indistinguiveis pelo erro: nos dois casos o script que estava rodando
 * morre junto com o documento. A diferenca so aparece olhando ONDE o navegador
 * parou. Ao confirmar o aviso de biometria o GERID recarrega direto em
 * `/tarefas/detalhar_tarefa/<protocolo>` — se o robo tratasse isso como falha
 * de navegacao, tentaria o caso de novo e abriria um SEGUNDO pedido para a
 * mesma pessoa. Por isso a pergunta vem ANTES da retentativa, sempre.
 *
 * Devolve o resultado de sucesso quando ha protocolo de HOJE, deste caso, na
 * tela; senao null, e a retentativa segue normalmente.
 */
async function protocoloDepoisDeNavegar(tabId, caso) {
  try {
    // A tela nova ainda pode estar carregando: o erro chega no instante em que
    // o documento antigo morre, nao quando o novo termina.
    const limite = Date.now() + 20000;
    while (Date.now() < limite) {
      const aba = await chrome.tabs.get(tabId).catch(() => null);
      if (!aba) return null;
      if (aba.status === 'complete') break;
      await new Promise((r) => setTimeout(r, 400));
    }
    await new Promise((r) => setTimeout(r, 1200));

    const protocolo = await lerProtocoloNaTelaDetalhe(tabId, caso.cpf, caso.nome);
    if (!protocolo) return null;

    sendLog(
      `O GERID trocou de tela porque o requerimento ENTROU: protocolo ${protocolo} ` +
      `para ${caso.nome}. Nao vou refazer o caso.`,
    );
    return {
      status: 'sucesso',
      protocolo,
      erro: 'O GERID saiu do formulário direto para o detalhe da tarefa (é o que acontece ' +
        'quando ele exige o cadastro biométrico). O protocolo foi lido nessa tela.',
    };
  } catch (erro) {
    sendLog(`Nao consegui conferir a tela depois da navegacao: ${erro?.message || erro}`);
    return null;
  }
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
        const jaEntrou = await protocoloDepoisDeNavegar(abaId, casoComAnexos);
        if (jaEntrou) return jaEntrou;
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
        const jaEntrou = await protocoloDepoisDeNavegar(tabId, casoComAnexos);
        if (jaEntrou) return jaEntrou;
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

/**
 * Janela padrao da consulta: dois meses, o teto pedido pelo operador.
 *
 * Em DIAS, e nao em meses, porque subtrair mes de uma data dia 31 escorrega
 * para o mes seguinte (31/03 menos dois meses vira 03/03). A consulta nao
 * precisa de precisao de calendario, precisa de janela curta.
 */
const JANELA_CURTA_DIAS = 62;

/**
 * A janela da SEGUNDA tentativa: ~5 meses, logo abaixo do teto de 6 do GERID.
 *
 * A curta responde rapido e cobre o caso comum — protocolo de hoje,
 * requerimento aberto ha pouco. So que ela nao sabe a diferenca entre "nao
 * existe" e "e mais velho que a janela", e ha exatamente duas perguntas em que
 * confundir as duas custa caro:
 *
 * - "posso protocolar?" — errar abre um pedido em DUPLICATA no nome de uma
 *   pessoa real. Foi o que aconteceu com a FABIA: a consulta voltou vazia, o
 *   robo abriu o formulario e quem barrou foi o proprio portal, no passo 2.
 * - "cade o comprovante deste protocolo?" — errar deixa o cliente voltando a
 *   fila todo dia em modo so-comprovante, atras de um PDF que a consulta nunca
 *   alcanca. Um laco que nao termina sozinho.
 *
 * Nessas duas, e so nessas, vale pagar a segunda consulta.
 */
const JANELA_LARGA_DIAS = 150;

/** Comeco do periodo da consulta, em dd/mm/aaaa. */
function dataInicialDaConsulta(diasParaTras = JANELA_CURTA_DIAS, agora = Date.now()) {
  const d = new Date(agora - diasParaTras * 24 * 60 * 60 * 1000);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Filtra a lista por CPF e devolve as linhas encontradas. */
async function buscarLinhasNaLista(tabId, cpf, diasParaTras = JANELA_CURTA_DIAS) {
  const saida = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [String(cpf || '').replace(/\D/g, ''), dataInicialDaConsulta(diasParaTras)],
    func: async (cpfDigitos, DATA_INICIAL) => {
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
      const preencher = (input, valor) => {
        if (setter) setter.call(input, valor); else input.value = valor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      preencher(campo, cpfDigitos);
      await dormir(400);

      // "Atualizada em (Inicial)": a janela que quem chamou escolheu.
      //
      // Aqui eu forcava 01/01/2015, para a consulta nao esconder requerimento
      // antigo. O proprio GERID derrubou a ideia: "O intervalo entre as datas
      // nao pode ultrapassar 6 meses". Com o periodo largo a busca era RECUSADA
      // e a tabela voltava "Nenhum registro encontrado" — o filtro que existia
      // para nao perder resposta passou a perder TODAS, que e o pior resultado
      // possivel numa consulta cuja funcao e nao protocolar em duplicata.
      //
      // O que o codigo nao pode fazer e confundir "nao esta na janela" com
      // "nunca existiu" — por isso a data entra no aviso quando a busca volta
      // vazia, e por isso quem chama pode repetir a consulta mais longe.
      const campoData = document.querySelector('#filtro-entidade-conveniada-data-inicial');
      if (campoData) {
        preencher(campoData, DATA_INICIAL);
        await dormir(300);
      }
      const periodoDaTela = () => {
        const desde = norm(
          document.querySelector('#filtro-entidade-conveniada-data-inicial')?.value || '',
        );
        return desde ? `A consulta olhou de ${desde} para ca.` : '';
      };

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

      const assinatura = () => lerLinhas().map((l) => l.protocolo).join(',');
      const antes = assinatura();
      buscar.click();

      // A tabela precisa RESPONDER ao clique antes de qualquer leitura. Sem
      // isto a segunda consulta — a de janela maior — aceitaria na hora o
      // resultado da primeira, que continua na tela e ja passa em todos os
      // testes abaixo: mesmo CPF, linhas de verdade. A pergunta "e mais velho
      // que a janela?" voltaria a mesma resposta errada, so que mais devagar.
      // Quando as duas janelas trazem exatamente as mesmas linhas isto expira
      // sem fazer mal: o resultado ja e o certo, custou seis segundos.
      await esperar(() => assinatura() !== antes, 6000);

      // A busca vai ao servidor. So aceita quando a tabela inteira for do CPF
      // pedido: enquanto vier linha de outra pessoa, o resultado ainda e o antigo.
      const filtradas = await esperar(() => {
        const linhas = lerLinhas();
        if (!linhas.length) return null;
        if (!linhas.every((l) => l.cpf === cpfDigitos)) return null;
        return linhas;
      }, 25000);
      const juntar = (...partes) => partes.filter(Boolean).join(' ');
      if (filtradas) return { linhas: filtradas };

      // O filtro pode nao ter pegado. Em vez de desistir, aproveita o que esta
      // na tela — a linha certa continua sendo a que tem este CPF.
      const naTela = lerLinhas().filter((l) => l.cpf === cpfDigitos);
      if (naTela.length) {
        return { linhas: naTela, aviso: 'O filtro de CPF nao pegou; li a linha direto da tabela.' };
      }
      // Aqui, e so aqui, o periodo importa: "nao achei" sem dizer em que janela
      // procurei convida a ler como "esta pessoa nunca teve requerimento".
      return {
        linhas: [],
        aviso: juntar(
          antes === assinatura()
            ? 'A lista nao mudou depois do Buscar; pode nao ter filtrado.'
            : 'A lista do GERID nao trouxe nenhuma linha para este CPF.',
          periodoDaTela(),
        ),
      };
    },
  });
  return saida[0]?.result || { erro: 'A lista de tarefas nao respondeu.' };
}

/**
 * A mesma consulta, de novo, olhando mais longe.
 *
 * Segunda consulta e caro e por isso ela e explicita: quem chama precisa dizer
 * POR QUE a janela curta nao serviu, e essa frase vai para o log. Assim o
 * operador ve a pergunta antes da resposta, em vez de encontrar duas buscas
 * identicas seguidas e ter que adivinhar qual valeu.
 */
async function buscarMaisLonge(tabId, cpf, porque) {
  sendLog(
    `${porque} Vou repetir a consulta olhando ${Math.round(JANELA_LARGA_DIAS / 30)} meses para tras.`,
  );
  return buscarLinhasNaLista(tabId, cpf, JANELA_LARGA_DIAS);
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
/**
 * O comprovante que o GERID entrega como DOWNLOAD do navegador.
 *
 * Os ganchos de dentro da pagina (`createObjectURL`, `fetch`, `<a download>`)
 * so enxergam PDF que nasce no proprio documento. Quando o clique em "Gerar
 * Comprovante" dispara um download de verdade — que e o que acontece na tela
 * de Tarefas — o arquivo vai direto para a pasta de downloads e a pagina nao
 * ve nada. Era esse o buraco: o robo protocolava, pedia o comprovante, o PDF
 * baixava na maquina do operador, e o sistema registrava "PDF nao capturado".
 *
 * Aqui o background escuta o evento. Precisa estar ARMADO antes do clique.
 */
function esperarDownload(ms) {
  return new Promise((resolve) => {
    let respondido = false;
    const encerrar = (item) => {
      if (respondido) return;
      respondido = true;
      clearTimeout(prazo);
      try { chrome.downloads.onCreated.removeListener(ouvir); } catch (e) {}
      resolve(item);
    };
    const ouvir = (item) => encerrar(item);
    const prazo = setTimeout(() => encerrar(null), ms);
    try {
      chrome.downloads.onCreated.addListener(ouvir);
    } catch (e) {
      encerrar(null);
    }
  });
}

/**
 * Le a URL do download DENTRO da aba do GERID.
 *
 * De proposito na aba, e nao no background: o link do comprovante e da sessao
 * autenticada. Buscar de fora sairia sem os cookies e voltaria a tela de
 * login em vez do PDF. `blob:` tambem so existe para o documento que criou.
 */
async function lerUrlNaAba(tabId, url) {
  const saida = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [url],
    func: async (endereco) => {
      try {
        const resposta = await fetch(endereco, { credentials: 'include' });
        if (!resposta.ok) return { erro: `O download respondeu ${resposta.status}.` };
        const blob = await resposta.blob();
        const base64 = await new Promise((resolve) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
          leitor.onerror = () => resolve('');
          leitor.readAsDataURL(blob);
        });
        return base64
          ? { pdfBase64: base64, bytes: blob.size }
          : { erro: 'Nao consegui ler o arquivo baixado.' };
      } catch (erro) {
        return { erro: `Nao consegui reler o download: ${erro?.message || erro}` };
      }
    },
  });
  return saida[0]?.result || { erro: 'A aba nao respondeu ao reler o download.' };
}

async function gerarComprovanteNaLista(tabId, protocolo) {
  // Armado ANTES do clique: o download pode comecar em milissegundos, e um
  // ouvinte registrado depois perde o evento.
  const download = esperarDownload(30000);
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
  const naPagina = saida[0]?.result || { erro: 'A tela do comprovante nao respondeu.' };
  if (naPagina.pdfBase64) return naPagina;

  // Nada dentro da pagina. Se o navegador baixou, o arquivo existe — so nao
  // passou por onde estavamos olhando.
  const item = await download;
  const endereco = item?.finalUrl || item?.url;
  if (!endereco) return naPagina;
  sendLog(`O comprovante veio como download do navegador; relendo o arquivo (${item.filename || 'sem nome'}).`);
  const relido = await lerUrlNaAba(tabId, endereco).catch((erro) => ({
    erro: `Nao consegui reler o download: ${erro?.message || erro}`,
  }));
  if (relido.pdfBase64) return relido;
  return { erro: `${naPagina.erro || 'sem captura na pagina'} | ${relido.erro}` };
}

/**
 * O protocolo na tela de DETALHE da tarefa, se for mesmo deste caso.
 *
 * Ao confirmar o aviso de biometria o GERID recarrega o navegador em
 * `/tarefas/detalhar_tarefa/<protocolo>`. Sem ler aqui, o background so veria
 * "a pagina recarregou durante o preenchimento" e tentaria o caso outra vez —
 * um SEGUNDO requerimento no nome de quem ja tem um.
 *
 * Devolve '' quando a tela nao e essa, quando nao ha numero, quando o dono da
 * tela nao e o caso (numero de terceiro entraria no painel como se fosse deste
 * cliente) ou quando o requerimento nao e de HOJE — a tela de detalhe tambem
 * abre por um BPC que a pessoa pediu ano passado, e usar aquele numero marcaria
 * como protocolado um caso que nunca foi enviado.
 */
async function lerProtocoloNaTelaDetalhe(tabId, cpf, nome) {
  try {
    await garantirContentScript(tabId);
    const tela = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => window.protocoloDaTarefaNaTela?.() || null,
    }).then((r) => r[0]?.result).catch(() => null);
    const lido = String(tela?.protocolo || '');
    if (!lido) return '';

    const protocoladoEm = String(tela?.protocoladoEm || '');
    if (protocoladoEm && protocoladoEm !== dataDeHojeBR()) {
      sendLog(
        `A tela de detalhe mostra o protocolo ${lido}, protocolado em ${protocoladoEm} ` +
        '(nao e de hoje). Nao usei esse numero.',
      );
      return '';
    }

    const dono = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [String(cpf || ''), String(nome || '')],
      func: (cpfAlvo, nomeAlvo) => window.requerimentoAbertoEhDoCaso?.(cpfAlvo, nomeAlvo) || 'indefinido',
    }).then((r) => r[0]?.result).catch(() => 'indefinido');

    if (dono === 'nao') {
      sendLog(`A tela de detalhe mostra o protocolo ${lido}, mas de outra pessoa. Ignorei.`);
      return '';
    }
    return lido;
  } catch (erro) {
    sendLog(`Nao consegui ler a tela de detalhe da tarefa: ${erro?.message || erro}`);
    return '';
  }
}

/**
 * Clica "Gerar Comprovante" NA PROPRIA tela de detalhe e captura o PDF.
 *
 * E o caminho curto: o robo ja esta na pagina do requerimento que acabou de
 * protocolar, com o botao a vista (`#btn-dt-gerar-comprovante`). Abrir uma aba
 * nova e refiltrar a lista por CPF, como faz `gerarComprovanteNaLista`, so faz
 * sentido quando o robo NAO esta nesta tela.
 *
 * ⚠️ Ao lado do botao certo existe "Cancelar Requerimento", que apaga o pedido
 * que acabou de entrar. Por isso a busca e pelo id exato, nunca por texto nem
 * por posicao.
 */
async function gerarComprovanteNaTelaDetalhe(tabId, protocolo) {
  // Mesmo motivo da lista: o "Gerar Comprovante" daqui tambem pode sair como
  // download do navegador, e ai nada aparece dentro da pagina.
  const download = esperarDownload(30000);
  const saida = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [String(protocolo || '').replace(/\D/g, '')],
    func: async (protocoloAlvo) => {
      const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
      const g = window;
      if (!g.__geridCapturaPdf) {
        g.__geridCapturaPdf = { blob: null, dataUrl: '', pedidoPara: '' };
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
      // Confere que a tela aberta e a do protocolo pedido ANTES de clicar: se o
      // GERID tiver trocado de requerimento, o PDF baixado seria de outro caso.
      const naTela = document.querySelector('#tarefas-container');
      if (!naTela) return { erro: 'Esta aba nao esta na tela de detalhe da tarefa.' };
      if (protocoloAlvo && !String(naTela.innerText || '').replace(/\D/g, '').includes(protocoloAlvo)) {
        return { erro: `A tela de detalhe aberta nao e a do protocolo ${protocoloAlvo}.` };
      }

      // Um clique = um arquivo no disco do operador. O GERID nao substitui o
      // anterior: o Chrome vai empilhando "comprovante (5).pdf", "(6)", "(7)".
      // Se esta funcao rodar duas vezes para o MESMO protocolo (retomada da
      // fila, alarme, reload da aba), o resultado sao copias do mesmo PDF na
      // pasta de downloads. Entao o clique acontece uma vez por protocolo.
      const jaPedido = g.__geridCapturaPdf.pedidoPara === protocoloAlvo;

      const botao = document.querySelector('#btn-dt-gerar-comprovante');
      if (!botao) return { erro: 'Nao achei o botao "Gerar Comprovante" na tela de detalhe.' };
      if (!jaPedido) {
        // O que ficou capturado era de OUTRO protocolo. Zerar so aqui, junto do
        // clique novo: apagar antes de um clique que nao vai acontecer jogaria
        // fora o PDF certo que ja estava na mao.
        g.__geridCapturaPdf.blob = null;
        g.__geridCapturaPdf.dataUrl = '';
        g.__geridCapturaPdf.pedidoPara = protocoloAlvo;
        botao.click();
      }

      // O PDF sai no ato do clique. A espera e curta de proposito: o operador
      // esta esperando o proximo caso, e comprovante que nao veio se resolve
      // depois pela lista de tarefas — o requerimento ja esta protocolado.
      const fim = Date.now() + (jaPedido ? 3000 : 25000);
      for (;;) {
        if (g.__geridCapturaPdf.blob || g.__geridCapturaPdf.dataUrl) break;
        if (Date.now() >= fim) {
          return jaPedido
            ? { erro: `Ja pedi o comprovante do protocolo ${protocoloAlvo} nesta tela e nao capturei o arquivo. Nao cliquei de novo para nao baixar copia repetida.` }
            : { erro: 'Pedi o comprovante, mas nao consegui capturar o arquivo.' };
        }
        await dormir(200);
      }

      if (g.__geridCapturaPdf.dataUrl) {
        const base64 = g.__geridCapturaPdf.dataUrl.split(',')[1] || '';
        return base64
          ? { pdfBase64: base64, bytes: Math.round(base64.length * 0.75) }
          : { erro: 'O link do comprovante veio vazio.' };
      }
      const blob = g.__geridCapturaPdf.blob;
      const base64 = await new Promise((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
        leitor.onerror = () => resolve('');
        leitor.readAsDataURL(blob);
      });
      return base64
        ? { pdfBase64: base64, bytes: blob.size }
        : { erro: 'Nao consegui ler o arquivo do comprovante.' };
    },
  });
  const naPagina = saida[0]?.result || { erro: 'A tela de detalhe nao respondeu.' };
  if (naPagina.pdfBase64) return naPagina;
  const item = await download;
  const endereco = item?.finalUrl || item?.url;
  if (!endereco) return naPagina;
  sendLog(`Comprovante baixado pelo navegador na tela de detalhe; relendo o arquivo.`);
  const relido = await lerUrlNaAba(tabId, endereco).catch((erro) => ({
    erro: `Nao consegui reler o download: ${erro?.message || erro}`,
  }));
  return relido.pdfBase64 ? relido : { erro: `${naPagina.erro || 'sem captura na pagina'} | ${relido.erro}` };
}

/**
 * Traz o comprovante SEM sair da tela em que o robo ja esta, quando da.
 *
 * MUTA `resultado`, igual a `conferirNaListaDeTarefas`. Devolve true quando o
 * PDF veio — o chamador so cai para a lista de tarefas se aqui der false.
 */
async function comprovantePelaTelaDeDetalhe(tabId, caso, resultado) {
  const protocolo = await lerProtocoloNaTelaDetalhe(tabId, caso.cpf, caso.nome);
  if (!protocolo) return false;

  if (!resultado.protocolo) {
    resultado.status = 'sucesso';
    resultado.protocolo = protocolo;
    sendLog(`${caso.nome}: a tela de detalhe do GERID mostra o protocolo ${protocolo}.`);
  } else if (String(resultado.protocolo).replace(/\D/g, '') !== protocolo) {
    // Divergencia e caso para humano, nao para escolha do robo.
    sendLog(
      `ATENCAO: li ${resultado.protocolo} no preenchimento e ${protocolo} na tela de detalhe. ` +
      'Nao baixei comprovante nenhum; confira qual e o requerimento certo.',
    );
    return false;
  }

  const pdf = await gerarComprovanteNaTelaDetalhe(tabId, protocolo);
  if (!pdf.pdfBase64) {
    sendLog(`Nao consegui gerar o comprovante na tela de detalhe: ${pdf.erro || 'motivo desconhecido'}`);
    return false;
  }
  resultado.pdfBase64 = pdf.pdfBase64;
  resultado.pdfNome = `comprovante ${protocolo}.pdf`;
  sendLog(`Comprovante do protocolo ${protocolo} capturado na tela de detalhe (${pdf.bytes} bytes).`);
  return true;
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

    let linhas = busca.linhas || [];
    const hoje = dataDeHojeBR();
    // Sem numero em maos, a regra e "so linha de HOJE" — um BPC do ano passado
    // nao pode ser apresentado como trabalho desta rodada.
    //
    // A excecao e quando o PROPRIO GERID recusou dizendo que ja existe pedido.
    // Ai a linha de outro dia deixa de ser coincidencia e passa a ser a resposta
    // da pergunta: e ela que tem o numero e o comprovante que faltam.
    const portalDisseQueJaExiste = !jaTem && indicioDeRequerimentoExistente(resultado.erro);
    const escolher = (candidatas) => (jaTem
      ? candidatas.find((l) => l.protocolo === jaTem)
      : candidatas.find((l) => l.protocoladoEm === hoje)
        || (portalDisseQueJaExiste
          ? candidatas.find((l) => ehMesmoServicoDoRobo(l.servico) && situacaoEmAberto(l.situacao))
          : undefined));
    let escolhida = escolher(linhas);

    // O numero existe e a janela curta nao alcancou a linha dele. Este e o unico
    // ponto da consulta em que "nao achei" tem resposta conhecida — quem disse o
    // numero foi o proprio GERID. Sem esta segunda pergunta o caso terminava
    // aqui: protocolado, sem PDF, e voltando a fila em modo so-comprovante todo
    // dia para bater na mesma janela e falhar igual. Laco que nao acaba sozinho.
    if (!escolhida && jaTem) {
      const larga = await buscarMaisLonge(
        tabId, caso.cpf, `O protocolo ${jaTem} nao apareceu na janela curta.`,
      );
      if (!larga.erro) {
        if (larga.aviso) sendLog(`Lista de tarefas: ${larga.aviso}`);
        linhas = larga.linhas || [];
        escolhida = escolher(linhas);
      }
    }
    if (escolhida && portalDisseQueJaExiste && escolhida.protocoladoEm !== hoje) {
      sendLog(
        `O GERID recusou refazer o requerimento de ${caso.nome} e a consulta mostra ` +
        `${escolhida.protocolo} (${escolhida.situacao}, de ${escolhida.protocoladoEm}). ` +
        'Usei esse numero em vez de tentar de novo.',
      );
    }

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

/**
 * Situacoes que o GERID oferece no filtro "Situação" da consulta:
 * Em Análise (PENDENTE), Cancelada, Concluída, Exigência.
 *
 * Só as duas primeiras impedem um pedido novo. "Cancelada" e "Concluída" são
 * requerimentos ENCERRADOS — pedir de novo depois de um BPC negado é
 * exatamente o trabalho do escritório, e travar isso seria pior do que o
 * duplicado que estamos evitando.
 */
function situacaoEmAberto(situacao) {
  const t = String(situacao || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return t.includes('em analise') || t.includes('exigencia');
}

/**
 * A linha da consulta e do MESMO servico que o robo ia pedir?
 *
 * "Benefício Assistencial à Pessoa com Deficiência" — o nome oficial do INSS
 * sempre traz "Assistencial", e e so isso que se exige aqui. Um requerimento de
 * aposentadoria em analise nao pode bloquear um BPC.
 *
 * Se o GERID um dia abreviar o nome a ponto de sumir a palavra, esta funcao
 * devolve false e o robo apenas NAO usa o atalho — o bloqueio "pedido X em
 * aberto" do proprio portal continua sendo a ultima linha de defesa contra o
 * duplicado. Errar para o lado de nao reconhecer e seguro; o contrario nao e.
 */
function ehMesmoServicoDoRobo(servico) {
  return String(servico || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .includes('assistencial');
}

/**
 * Pergunta ao GERID, ANTES de preencher, se este CPF ja tem BPC em andamento.
 *
 * Existe porque a conferencia so acontecia DEPOIS: o robo preenchia o
 * requerimento inteiro e so entao descobria que ja havia um. Quando o portal
 * deixava passar, o resultado era um SEGUNDO pedido no nome de uma pessoa real
 * — e o RYAN, que tem protocolo no GERID mas consta como erro no painel, seria
 * o proximo. Uma consulta de dez segundos e mais barata que isso.
 *
 * Devolve `{ aberto, pdf }` quando achou requerimento em andamento; `{}` quando
 * o caminho esta livre; `{ erro }` quando nao deu para perguntar — e nesse caso
 * quem chama SEGUE o fluxo normal, porque falha de consulta nao pode virar
 * motivo para nao atender ninguem.
 */
async function verificarSeJaProtocolado(caso) {
  let tabId = null;
  try {
    tabId = await abrirAbaTarefas();
    const busca = await buscarLinhasNaLista(tabId, caso.cpf);
    if (busca.erro) return { erro: busca.erro };
    if (busca.aviso) sendLog(`Consulta do GERID: ${busca.aviso}`);

    const emAberto = (candidatas) => candidatas.find(
      (l) => ehMesmoServicoDoRobo(l.servico) && situacaoEmAberto(l.situacao),
    );
    let linhas = busca.linhas || [];
    let aberto = emAberto(linhas);

    // "Nada em aberto nos ultimos dois meses" NAO e "pode protocolar". Um BPC
    // aberto ha quatro meses cai fora da janela e continua impedindo o pedido
    // novo — e quem descobre passa a ser o portal, no passo 2, com o formulario
    // ja preenchido. Foi assim que a FABIA chegou ate a tela de bloqueio.
    //
    // Esta e a pergunta mais cara de errar do robo inteiro: liberar por engano
    // significa abrir um segundo requerimento no nome de uma pessoa real. Vale
    // a segunda consulta antes de dizer "pode".
    if (!aberto) {
      const larga = await buscarMaisLonge(
        tabId, caso.cpf, `Nada em aberto para ${caso.nome} na janela curta.`,
      );
      if (larga.erro) return { erro: larga.erro };
      if (larga.aviso) sendLog(`Consulta do GERID: ${larga.aviso}`);
      linhas = larga.linhas || [];
      aberto = emAberto(linhas);
    }
    if (!aberto) {
      sendLog(
        `Consulta do GERID: ${caso.nome} nao tem BPC em andamento` +
        `${linhas.length ? ` (${linhas.length} requerimento(s) no historico, nenhum em aberto)` : ''}. ` +
        'Pode protocolar.',
      );
      return {};
    }

    sendLog(
      `${caso.nome} JA TEM requerimento no GERID: protocolo ${aberto.protocolo}, ` +
      `${aberto.servico}, ${aberto.situacao}, protocolado em ${aberto.protocoladoEm}. ` +
      'NAO vou preencher outro.',
    );
    const pdf = await gerarComprovanteNaLista(tabId, aberto.protocolo);
    if (!pdf.pdfBase64) sendLog(`Nao consegui baixar o comprovante agora: ${pdf.erro || 'motivo desconhecido'}`);
    return { aberto, pdf };
  } catch (erro) {
    return { erro: erro?.message || String(erro) };
  } finally {
    if (tabId !== null && tabId !== undefined) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (falhaAoFechar) {
        sendLog(`Nao consegui fechar a aba da consulta: ${falhaAoFechar?.message || falhaAoFechar}`);
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
      sendLog(
        `Comprovante de ${caso.nome} confirmado no painel E no Drive do cliente.` +
        (conferido.whatsapp ? ' Tambem foi para o WhatsApp.' : ''),
      );
    } else if (conferido.painel || conferido.drive) {
      // Meio caminho nao e "deu certo". O pedido e o arquivo nos DOIS lugares, e
      // o destino que faltou e sempre o Drive na pratica (a service account nao
      // tem cota para criar arquivo). Dizer "confirmado" aqui faria o operador
      // fechar o caso sem o comprovante na pasta do cliente.
      const entrou = conferido.painel ? 'painel' : 'Drive do cliente';
      const faltou = conferido.painel ? 'Drive do cliente' : 'painel';
      sendLog(
        `ATENCAO: o comprovante de ${caso.nome} entrou no ${entrou} mas NAO no ${faltou}. ` +
        (conferido.whatsapp ? 'Mandei no WhatsApp para nao ficar so no servidor. ' : '') +
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

      // A etapa tambem vem `null` quando a aba simplesmente nao sabe responder:
      // content script fora do ar, ou uma tela que nem e do wizard — a lista de
      // tarefas, por exemplo, que e onde o operador cai depois de logar. Nesse
      // caso o `if` acima nao pega, e sem um prazo isto vira espera infinita: o
      // alarme reagenda, o popup mostra "Aguardando confirmacao: 0" e NENHUMA
      // fila nova consegue comecar, porque `verificarConfirmacaoPendente`
      // responde `true` e corta o caminho de todo mundo.
      const desde = Number(ativa.aguardandoDesde) || Date.now();
      if (Date.now() - desde > LIMITE_ESPERA_CONFIRMACAO_MS) {
        await limparExecucaoAtiva();
        sendLog(
          `Esperei ${Math.round(LIMITE_ESPERA_CONFIRMACAO_MS / 60000)} minutos pela confirmacao de ` +
          `${ativa.nomeAtual || 'cliente atual'} e a tela nunca mostrou o numero do protocolo, ` +
          'entao parei de esperar. CONFIRA no GERID se esse requerimento ja foi protocolado ANTES ' +
          'de rodar a fila de novo.',
        );
        chrome.runtime.sendMessage({ action: 'finished' }).catch(() => {});
        return true;
      }
      if (!ativa.aguardandoDesde) {
        await salvarExecucaoAtiva({ ...ativa, aguardandoDesde: desde });
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

/**
 * O GERID esta dizendo que ESTE requerente ja tem um pedido?
 *
 * "Em aberto" era a unica forma reconhecida, e o portal tem varias: em
 * andamento, em processamento, em analise, ja possui, ja existe. Todas
 * significam a mesma coisa para o robo — nao e para preencher outro, e a
 * consulta e que vai dizer qual e o numero.
 *
 * Nao extrai numero nenhum daqui: e so o gatilho para ir perguntar. Numero de
 * protocolo so entra no painel vindo da consulta ou da tela, nunca deduzido de
 * texto de alerta.
 */
function indicioDeRequerimentoExistente(texto) {
  const t = String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /em aberto|em andamento|em processamento|em analise|ja possui|ja existe/.test(t);
}

function erroDefinitivoDoRequerente(resultado) {
  if (resultado?.status !== 'erro') return false;
  const texto = String(resultado.erro || '').toLowerCase();
  // Só um bloqueio inequívoco do próprio Gerid encerra automaticamente o caso.
  // Falhas de tela, rede ou mapeamento precisam permanecer pendentes para retry.
  if (/pedido\s+\d+.*em aberto|existe pedido em aberto|cpf inv[aá]lido/.test(texto)) return true;
  // Requerimento que o portal diz JA EXISTIR nao melhora com nova tentativa:
  // repetir so produziria o duplicado que estamos evitando.
  return indicioDeRequerimentoExistente(texto);
}

async function processQueue(
  apiUrl,
  apiToken,
  modoTeste,
  tabIdPreferido,
  tentativasRetomada = 0,
  iniciarSeVazia = false,
  { silencioso = false } = {},
) {
  let manterExecucaoPendente = false;
  try {
    if (!apiToken) throw new Error('A chave da extensão não foi informada.');
    if (!silencioso) sendLog('Iniciando processamento...');
    let data = await buscarFila(apiUrl, apiToken);

    // Pausa pedida no painel: nem abre o GERID. A execucao continua viva e os
    // casos continuam pendentes, entao `manterExecucaoPendente` segue falso de
    // proposito — nao ha caso em andamento para preservar.
    //
    // A checagem vem ANTES de `prepararFila`: com a fila pausada o servidor
    // devolve `casos: []`, o que parecia "fila vazia" e fazia um clique em
    // Iniciar mandar preparar fila nova — furando justamente a pausa.
    const avisarPausa = () => (silencioso
      ? relatarRonda('Fila PAUSADA no painel. Clique em Retomar fila no painel para continuar.')
      : Promise.resolve(
        sendLog('Fila PAUSADA no painel. Clique em Retomar fila no painel para continuar.'),
      ));
    if (data.pausada) {
      await avisarPausa();
      return;
    }

    if ((!data.idExecucao || data.casos.length === 0) && iniciarSeVazia) {
      if (!silencioso) sendLog('Preparando a fila no servidor...');
      const preparo = await prepararFila(apiUrl, apiToken);
      // Dia sem pasta nova: o robo fica esperando, e e so isso que aconteceu.
      // Quem clicou no botao recebe a resposta na hora; a ronda so registra
      // quando o motivo muda.
      if (preparo?.semTrabalho) {
        if (silencioso) await relatarRonda(preparo.motivo);
        else sendLog(preparo.motivo);
        return;
      }
      data = await buscarFila(apiUrl, apiToken);
      if (data.pausada) {
        await avisarPausa();
        return;
      }
    }

    const casos = modoTeste ? data.casos.slice(0, 1) : data.casos;
    if (casos.length === 0 || !data.idExecucao) {
      await relatarFilaVazia(data, silencioso);
      return;
    }

    // Daqui para baixo ha trabalho de verdade. O robo volta a falar por
    // completo: as linhas seguintes sao sobre um requerimento em nome de uma
    // pessoa, e nenhuma delas pode ser engolida por ser parecida com a de
    // ontem. Esquecer o relato tambem faz a proxima volta ao repouso ser
    // anunciada em vez de silenciada.
    silencioso = false;
    await esquecerRelatoDaRonda();

    let aba;
    try {
      aba = await localizarAbaGerid(tabIdPreferido);
    } catch {
      aba = await abrirAutenticacao();
    }

    // ANTES de qualquer coisa na aba. A tela de bloqueio da Dataprev responde
    // 200 e mora na url do INSS, entao os testes abaixo a leriam como "sessao
    // caiu" e mandariam autenticar de novo — mais navegacao automatizada em
    // cima de quem acabou de dizer que a navegacao esta suspeita.
    const bloqueio = await bloqueioAntiabuso(aba?.id);
    if (bloqueio) {
      sendLog(
        'A Dataprev suspendeu o acesso a este computador ("Solucao de Protecao de Sistemas"'
        + (bloqueio.ocorrencia ? `, ocorrencia ${bloqueio.ocorrencia}` : '')
        + '). Parei a fila: insistir agora so piora. Espere o bloqueio cair, acesse uma vez '
        + 'na mao para conferir, e reinicie a fila depois.',
      );
      await enviarHeartbeat(apiUrl, apiToken, data.idExecucao, 'erro', 'Acesso suspenso pela Dataprev.')
        .catch(() => undefined);
      await registrarErroNoPainel(apiUrl, apiToken, {
        etapa: 'antiabuso',
        mensagem: 'A Dataprev suspendeu o acesso a este computador.',
        detalhe: bloqueio.ocorrencia ? `Ocorrencia Dataprev ${bloqueio.ocorrencia}` : '',
      });
      await limparExecucaoAtiva().catch(() => undefined);
      return;
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

    // Quem falhou por motivo nao definitivo e vai voltar na proxima passada.
    const parados = [];
    // Parada deliberada (pausa, 2FA, revisao, tela travada). Cada uma dessas ja
    // gravou o proprio estado e ja disse ao operador o que fazer; o reagendamento
    // do fim do laco NAO pode passar por cima disso.
    let interrompida = false;

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
        interrompida = true;
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
      // Caso que JA TEM protocolo e voltou so para buscar o comprovante que
      // faltou. Aqui o robo NAO abre o formulario de requerimento: abrir seria
      // criar um SEGUNDO pedido no nome da mesma pessoa. O numero ja e
      // conhecido, entao ele vai direto a lista de tarefas, gera o PDF e fecha.
      if (caso.somenteComprovante && caso.protocolo) {
        sendLog(
          `${caso.nome} ja esta protocolado (${caso.protocolo}); vou so buscar o comprovante que faltou.`,
        );
        const resultado = { status: 'sucesso', protocolo: caso.protocolo };
        await conferirNaListaDeTarefas(caso, resultado);
        if (!resultado.pdfBase64) {
          // Sem PDF o caso continua protocolado — o que falta e o arquivo.
          // Marcar erro apagaria o numero e liberaria um reprotocolo.
          sendLog(
            `Nao consegui o comprovante de ${caso.nome} agora. O protocolo ${caso.protocolo} ` +
            'continua valido; tento de novo na proxima fila.',
          );
        }
        await enviarResultado(apiUrl, apiToken, data.idExecucao, caso, resultado);
        continue;
      }

      // Pergunta ao GERID ANTES de tocar no formulario. A conferencia que ja
      // existia acontecia depois do preenchimento, o que so descobria o pedido
      // repetido quando ele ja tinha sido feito.
      const jaExiste = await verificarSeJaProtocolado(caso);
      if (jaExiste.erro) {
        // Consulta indisponivel nao pode virar motivo para nao atender ninguem.
        // O bloqueio "pedido X em aberto" do proprio portal continua valendo.
        sendLog(
          `Nao consegui consultar o GERID antes de protocolar ${caso.nome}: ${jaExiste.erro}. ` +
          'Sigo com o preenchimento.',
        );
      } else if (jaExiste.aberto) {
        const achado = jaExiste.aberto;
        const resultadoConsulta = {
          status: 'sucesso',
          protocolo: achado.protocolo,
          erro:
            `JA ESTAVA protocolado: ${achado.protocolo} (${achado.servico}, ${achado.situacao}, ` +
            `protocolado em ${achado.protocoladoEm}). Consultei antes e nao refiz o requerimento.`,
        };
        if (jaExiste.pdf?.pdfBase64) {
          resultadoConsulta.pdfBase64 = jaExiste.pdf.pdfBase64;
          resultadoConsulta.pdfNome = `comprovante ${achado.protocolo}.pdf`;
        }
        await enviarResultado(apiUrl, apiToken, data.idExecucao, caso, resultadoConsulta);
        continue;
      }

      sendLog(`Processando: ${caso.nome}`);
      const casoComAnexos = {
        ...caso,
        anexos: await baixarAnexos(apiUrl, apiToken, data.idExecucao, caso.anexos),
      };
      const resultado = await executarCasoNoGerid(aba.id, casoComAnexos);

      // Sessao morta: a lista tambem nao carregaria. Nos outros casos sempre
      // pergunta ao GERID — inclusive no sucesso, porque e de la que vem o PDF.
      //
      // Antes da lista, tenta a tela em que o robo JA esta: quando o GERID
      // termina no detalhe da tarefa, o botao "Gerar Comprovante" esta ali na
      // frente e nao ha por que abrir aba nova e refiltrar por CPF. So cai para
      // a lista quando esse caminho curto nao resolve.
      if (resultado.status !== 'autenticacao') {
        const pelaTela = await comprovantePelaTelaDeDetalhe(aba.id, caso, resultado)
          .catch(() => false);
        if (!pelaTela) await conferirNaListaDeTarefas(caso, resultado);
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
        interrompida = true;
        break;
      }

      // Falha que NAO e bloqueio definitivo do GERID: o caso fica de lado para
      // nova tentativa e a fila SEGUE para o proximo cliente.
      //
      // Antes daqui saía um `break` que matava a rodada inteira. Um modal que o
      // robô não sabia tratar no primeiro cliente deixava os outros três sem
      // nenhuma tentativa — e eles terminavam no histórico com "Execução
      // interrompida antes de processar este caso", que parece problema deles.
      // Nenhum dos dois lados disso é verdade: o problema era de um só, e os
      // outros nunca foram tentados.
      if (resultado.status === 'erro' && !erroDefinitivoDoRequerente(resultado)) {
        manterExecucaoPendente = true;
        parados.push(caso.nome);
        sendLog(`${caso.nome} ficou para depois: ${resultado.erro}`);

        // A tela precisa voltar a um ponto de partida antes do proximo cliente.
        // Se nao voltar nem em aba nova, ai sim para tudo: preencher por cima de
        // requerimento alheio e a unica coisa pior do que nao preencher.
        const proxima = await abaProntaParaProximoCaso(aba);
        if (!proxima) {
          sendLog(
            'Parei a fila: nao consegui devolver o GERID a uma tela inicial, nem abrindo ' +
            'uma aba nova. Resolva na tela e clique em Iniciar.',
          );
          interrompida = true;
          break;
        }
        aba = proxima;
        continue;
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
        // Protocolo que ja existia: nada foi enviado agora, e a aba ficou onde
        // o GERID barrou — meio do formulario, com o modal aberto. Diferente do
        // sucesso de verdade, que termina no comprovante e o proximo caso sabe
        // tratar. Aqui a tela PRECISA voltar ao inicio antes do proximo
        // cliente; sem isso a fila andava e ninguem mais conseguia comecar.
        if (resultado.jaEstavaAberto) {
          sendLog(
            `${caso.nome} ja tinha o pedido ${resultado.protocolo} em aberto; nao refiz. ` +
            'Voltando a tela ao inicio para o proximo.',
          );
          const proxima = await abaProntaParaProximoCaso(aba);
          if (!proxima) {
            sendLog(
              'Parei a fila: nao consegui devolver o GERID a uma tela inicial, nem abrindo ' +
              'uma aba nova. Resolva na tela e clique em Iniciar.',
            );
            interrompida = true;
            break;
          }
          aba = proxima;
          continue;
        }
        sendLog(`${caso.nome}: PROTOCOLADO — ${resultado.protocolo}`);

        // O protocolo ja foi enviado ao painel logo acima e o comprovante ja foi
        // buscado. O que sobrou na tela e o detalhe da tarefa concluida — com
        // "Gerar Comprovante", "Cancelar Requerimento" e "Voltar" — e dali o
        // proximo cliente nao comeca. O robo parava exatamente ai, de pedido
        // feito e tudo salvo, parecendo travado.
        //
        // Falhar aqui NAO derruba a fila: o caso deu certo e esta registrado. O
        // proximo tenta a partir de onde a tela estiver, e se tambem nao andar e
        // ele quem reporta.
        const seguinte = await abaProntaParaProximoCaso(aba, { requerimentoConcluido: true });
        if (seguinte) aba = seguinte;
        else sendLog('Nao consegui voltar a tela inicial depois do protocolo; sigo mesmo assim.');
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
        interrompida = true;
        break;
      }
    }

    // Uma nova passada por TODOS os que ficaram, e nao uma retentativa do
    // primeiro que falhou. O contador sobe uma vez por passada — antes subia uma
    // vez por caso, e tres clientes com problema esgotavam o limite antes de o
    // primeiro deles ter uma segunda chance.
    if (parados.length && !interrompida) {
      const proximaTentativa = tentativasRetomada + 1;
      manterExecucaoPendente = true;
      await salvarExecucaoAtiva({
        idExecucao: data.idExecucao,
        geridTabId: aba.id,
        modoTeste,
        tentativasRetomada: proximaTentativa,
        iniciadoEm: new Date().toISOString(),
      });
      sendLog(`${parados.length} caso(s) ficaram para nova tentativa: ${parados.join(', ')}.`);
      if (proximaTentativa <= MAX_RETOMADAS_AUTOMATICAS && chrome.alarms?.create) {
        chrome.alarms.create(ALARME_RETOMADA, { delayInMinutes: 0.1 });
        sendLog(`Nova passada agendada (${proximaTentativa}/${MAX_RETOMADAS_AUTOMATICAS}).`);
      } else {
        sendLog(
          'Cheguei ao limite de tentativas automaticas. Os casos continuam na fila: ' +
          'resolva o que o GERID pediu e clique em Iniciar.',
        );
      }
    } else if (parados.length) {
      sendLog(`Casos que ficaram para depois: ${parados.join(', ')}.`);
    }
  } catch (erro) {
    sendLog(`Erro fatal: ${erro?.message || erro}`);
    // Antes de qualquer retomada: e este registro que sobrevive ao dia e
    // permite corrigir a causa depois. O reagendamento abaixo so tenta de novo
    // — se o motivo nao ficar escrito em algum lugar, tentar de novo e tudo o
    // que este robo vai saber fazer para sempre.
    await registrarErroNoPainel(apiUrl, apiToken, {
      etapa: 'fila',
      mensagem: String(erro?.message || erro),
      detalhe: String(erro?.stack || '').slice(0, 3000),
    });
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

/**
 * Login concluido e nada pendente: prepara a fila e comeca, sem pedir clique.
 *
 * Era exatamente aqui que a automacao parava. `retomarExecucaoPersistida()` so
 * retoma o que ja existia; depois de um login novo nao existe execucao nenhuma,
 * entao ela voltava calada e o robo ficava esperando alguem abrir o popup e
 * clicar em "Preparar e iniciar" — com a sessao do GERID recem-autenticada,
 * sem fazer nada. Autenticar E o pedido para trabalhar: ninguem passa pelo
 * SafeID e pelo codigo de 6 digitos por acaso.
 *
 * `iniciarSeVazia = true` e o mesmo caminho do botao. O `modoTeste` continua
 * sendo o do operador (e continua valendo `true` quando ninguem escolheu),
 * porque quem decide entre a fila inteira e um caso so e a chave do popup — o
 * fato de ter logado nao muda essa escolha.
 */
async function iniciarFilaAposLogin(tabId) {
  if (isRunning) return;

  const { apiUrl, apiToken } = await credenciaisPainel();
  if (!apiUrl || !apiToken) {
    sendLog(
      'Sessao do GERID pronta, mas a extensao nao tem a chave do painel guardada. '
      + 'Abra a extensao e conecte ao painel para eu iniciar sozinho.',
    );
    return;
  }

  const salvo = await chrome.storage.local.get(['modoTeste']).catch(() => ({}));
  const modoTeste = salvo?.modoTeste !== false;

  isRunning = true;
  sendLog(modoTeste
    ? 'Autenticado. Iniciando sozinho em MODO TESTE (so o primeiro caso da fila).'
    : 'Autenticado. Iniciando a fila sozinho.');
  await processQueue(apiUrl, apiToken, modoTeste, tabId, 0, true);
}

/**
 * Tudo que acontece quando a sessao do GERID fica pronta, na ordem certa.
 *
 * A ordem importa e nao e arbitraria: um protocolo esperando confirmacao vem
 * antes de tudo (registrar o que ja foi feito, antes de fazer mais), depois a
 * execucao que ficou pela metade, e so quando nao ha nem uma nem outra e que
 * vale abrir fila nova. Trocar a ordem protocolaria por cima de um caso ainda
 * aberto.
 */
async function aoAutenticar(tabId, anterior) {
  if (await verificarConfirmacaoPendente(tabId)) return;

  await retomarExecucaoPersistida();
  if (isRunning) return;

  // Ja estava autenticado antes desta pagina: isto e navegacao dentro do GERID,
  // nao um login. Sem esta linha, terminar a fila e abrir qualquer tela do PAT
  // mandaria preparar uma fila nova.
  if (anterior === EstadoAutenticacao.AUTENTICADO) return;

  await iniciarFilaAposLogin(tabId);
}

/**
 * A ronda: de cinco em cinco minutos, para sempre, o robo olha se ha trabalho.
 *
 * E o que transforma a extensao de "ferramenta que alguem aciona" em processo
 * continuo. O navegador fica aberto o dia inteiro, e o robo sozinho: le o
 * Drive de novo (pasta que entrou hoje entra na fila; pasta que sumiu porque
 * foi protocolada nao volta), protocola o que apareceu, busca o comprovante,
 * manda no WhatsApp e volta a esperar.
 *
 * A ORDEM aqui e deliberada e nao pode ser trocada:
 *
 * 1. Ja esta trabalhando -> sai. Duas passadas ao mesmo tempo entregariam o
 *    mesmo cliente duas vezes, e duas vezes significa dois requerimentos
 *    abertos no INSS no nome da mesma pessoa.
 * 2. Execucao pela metade -> retoma ELA. Terminar o que ficou aberto vem antes
 *    de abrir fila nova, senao o caso do meio fica orfao.
 * 3. So entao procura trabalho novo.
 *
 * A autenticacao nao e verificada antes: quem descobre que a sessao caiu e o
 * `processQueue`, e ele so chega la depois de saber que existe alguem para
 * protocolar. Fazer o contrario mandaria o operador passar pelo SafeID e pelo
 * codigo de 6 digitos num dia em que nao havia nada a fazer.
 *
 * Esta e tambem a rede de seguranca externa: `ALARME_RETOMADA` tenta de novo
 * rapido e desiste depois de MAX_RETOMADAS_AUTOMATICAS, e ate agora era ai que
 * o robo parava de vez ate alguem clicar. A ronda pega o que sobrou — devagar,
 * sem laco quente, mas sem fim.
 */
async function rondaContinua() {
  if (isRunning) return;

  const { apiUrl, apiToken } = await credenciaisPainel();
  if (!apiUrl || !apiToken) {
    await relatarRonda(
      'A extensao nao tem a chave do painel guardada, entao nao consigo procurar '
      + 'trabalho sozinho. Abra o painel do RPA uma vez para reconectar.',
    );
    return;
  }

  await retomarExecucaoPersistida();
  if (isRunning) return;

  const salvo = await chrome.storage.local.get(['modoTeste']).catch(() => ({}));
  const modoTeste = salvo?.modoTeste !== false;

  isRunning = true;
  try {
    await processQueue(apiUrl, apiToken, modoTeste, undefined, 0, true, { silencioso: true });
  } catch (erro) {
    isRunning = false;
    await relatarRonda(`A ronda falhou: ${erro?.message || erro}`);
  }
}

/**
 * Liga a ronda. Chamado em todo caminho de entrada porque o service worker do
 * MV3 morre sozinho e ninguem avisa; recriar um alarme que ja existe apenas o
 * substitui, entao chamar demais nao custa nada e chamar de menos custa o dia.
 */
function armarRonda() {
  chrome.alarms?.create?.(ALARME_RONDA, {
    periodInMinutes: RONDA_MINUTOS,
    // Um minuto de folga na largada: no arranque do Chrome as abas ainda estao
    // carregando e a sessao do GERID pode nem ter sido restaurada.
    delayInMinutes: 1,
  });
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
    // Clique humano em "Abrir autenticacao" e intencao explicita, e intencao
    // explicita vence o debounce de 3 minutos: quem apertou o botao esta
    // dizendo que a solicitacao anterior nao chegou ou ja morreu. Quem clica
    // efetivamente e o listener de tabs.onUpdated, quando a pagina de login
    // terminar de carregar — aqui so tiramos a trava do caminho dele.
    void chrome.storage.local.remove(CHAVE_ULTIMO_CERTIFICADO)
      .catch(() => undefined)
      .then(() => abrirAutenticacao());
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
  armarRonda();
  void sincronizarAutorizacaoDoPainel();
  void retomarExecucaoPersistida();
});
chrome.runtime.onInstalled?.addListener(() => {
  armarRonda();
  void sincronizarAutorizacaoDoPainel();
  void retomarExecucaoPersistida();
});
// Fora de qualquer listener, de proposito: isto roda toda vez que o service
// worker acorda, inclusive nas vezes em que nem onStartup nem onInstalled
// disparam (que sao a maioria — o MV3 desliga o worker por inatividade e o
// religa no proximo evento). Sem esta linha, a ronda existiria so nos dois
// momentos em que ninguem precisa dela.
armarRonda();
chrome.alarms?.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_CONFIRMACAO) {
    void verificarConfirmacaoPendente();
  } else if (alarme.name === ALARME_RETOMADA || alarme.name === ALARME_AUTENTICACAO) {
    void retomarExecucaoPersistida();
  } else if (alarme.name === ALARME_RONDA) {
    void rondaContinua();
  }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url && info.status !== 'complete') return;
  const estado = estadoDaAba({ ...tab, url: info.url || tab.url });
  if (estado === EstadoAutenticacao.NECESSARIA) {
    if (abaDoPortalPat({ ...tab, url: info.url || tab.url }) && info.status === 'complete') {
      // O estado anterior e lido ANTES de qualquer gravacao: a primeira coisa
      // que este ramo faz e salvar NECESSARIA, e depois disso nao ha mais como
      // saber se o operador acabou de logar ou so trocou de tela.
      void estadoAutenticacaoSalvo().then((anterior) => atualizarEstadoAutenticacao(
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
          await aoAutenticar(tabId, anterior);
        }));
      return;
    }
    // Pedir o certificado vivia SO dentro do laco da fila. Com a fila vazia — ou
    // com a sessao caindo enquanto ninguem processa nada — o laco nunca roda, e
    // aqui a extensao apenas trocava o texto do aviso e ia embora: a tela de
    // login ficava aberta, o botao intocado, e o operador olhando para um
    // "conclua o SafeID" sem SafeID nenhum ter sido pedido.
    //
    // O clique nao autentica ninguem: so faz o SafeID mandar a notificacao para
    // o celular do titular. O debounce de 3 minutos la dentro impede encher o
    // aparelho de push se a pagina recarregar varias vezes.
    void atualizarEstadoAutenticacao(
      estado,
      'Conclua o SafeID e informe o codigo de 6 digitos do GERID.',
      tabId,
    ).then(async () => {
      if (info.status !== 'complete') return;
      const { apiUrl, apiToken } = await credenciaisPainel();
      await pedirAutorizacaoNoCelular(tabId, apiUrl, apiToken);
      // Retoma sozinha se havia execucao parada esperando a sessao voltar.
      agendarRetomadaAutenticacao();
    });
    return;
  }
  if (estado === EstadoAutenticacao.AUTENTICADO && info.status === 'complete') {
    void estadoAutenticacaoSalvo().then((anterior) => atualizarEstadoAutenticacao(
      estado,
      'Sessao do GERID pronta.',
      tabId,
    ).then(() => aoAutenticar(tabId, anterior)));
  }
});
void retomarExecucaoPersistida();
