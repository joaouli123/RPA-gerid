const URL_REQUERIMENTOS_GERID = 'https://atendimento.inss.gov.br/requerimentos';
const CHAVE_EXECUCAO_ATIVA = 'execucaoAtivaGerid';
const ALARME_RETOMADA = 'retomarExecucaoGerid';
const MAX_RETOMADAS_AUTOMATICAS = 3;

let isRunning = false;

function sendLog(message) {
  console.log(message);
  chrome.runtime.sendMessage({ action: 'log', message }).catch(() => {});
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
  const baixados = [];
  for (const anexo of anexos || []) {
    const url = `${base}/api/ext/arquivo?execucao=${encodeURIComponent(idExecucao)}&id=${encodeURIComponent(anexo.id)}`;
    const res = await buscarComTimeout(url, { headers: headersAutorizacao(apiToken) }, 90_000);
    if (!res.ok) throw new Error(`Não foi possível baixar "${anexo.nome}" (HTTP ${res.status}).`);
    baixados.push({
      tipo: anexo.tipo,
      nome: anexo.nome,
      mimeType: anexo.mimeType,
      base64: paraBase64(await res.arrayBuffer()),
    });
  }
  return baixados;
}

async function localizarAbaGerid(tabId) {
  if (Number.isInteger(tabId)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url?.includes('://atendimento.inss.gov.br/')) return tab;
    } catch {
      // A aba pode ter sido fechada; buscamos outra aberta abaixo.
    }
  }

  const abas = await chrome.tabs.query({ url: '*://*.inss.gov.br/*' });
  const aba = abas.find((tab) => tab.active) || abas[0];
  if (!aba?.id) throw new Error('Nenhuma aba do Gerid está aberta. Abra o Gerid e inicie novamente.');
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

function erroDeNavegacao(erro) {
  const texto = String(erro?.message || erro || '').toLowerCase();
  return /naveg|frame|context|recarreg|lista de servi|tela de servi|novo requerimento|script não retornou|timeout waiting|selector/.test(texto);
}

async function executarCasoNoGerid(tabId, casoComAnexos) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const abaId = await prepararAbaGerid(tabId, tentativa > 0);
      const verificacao = await chrome.scripting.executeScript({
        target: { tabId: abaId },
        func: () => typeof window.iniciarProcessamento === 'function',
      });
      if (!verificacao[0]?.result) {
        await chrome.scripting.executeScript({
          target: { tabId: abaId },
          files: ['content.js'],
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

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
  if (!resposta.ok) throw new Error(`Não foi possível registrar o resultado (HTTP ${resposta.status}).`);
}

function erroDefinitivoDoRequerente(resultado) {
  if (resultado?.status !== 'erro') return false;
  const texto = String(resultado.erro || '').toLowerCase();
  // Só um bloqueio inequívoco do próprio Gerid encerra automaticamente o caso.
  // Falhas de tela, rede ou mapeamento precisam permanecer pendentes para retry.
  return /pedido\s+\d+.*em aberto|existe pedido em aberto|cpf inv[aá]lido/.test(texto);
}

async function processQueue(apiUrl, apiToken, modoTeste, tabIdPreferido, tentativasRetomada = 0) {
  let manterExecucaoPendente = false;
  try {
    if (!apiToken) throw new Error('A chave da extensão não foi informada.');
    const aba = await localizarAbaGerid(tabIdPreferido);
    if (!aba.id) throw new Error('Não foi possível identificar a aba do Gerid.');

    sendLog('Iniciando processamento...');
    const url = apiUrl.replace(/\/$/, '') + '/api/ext/fila';
    const res = await buscarComTimeout(url, { headers: headersAutorizacao(apiToken) });
    const data = await res.json();
    if (!res.ok || !data.sucesso || !data.casos) throw new Error(data.erro || 'Erro ao buscar fila.');

    const casos = modoTeste ? data.casos.slice(0, 1) : data.casos;
    if (casos.length === 0 || !data.idExecucao) {
      sendLog('Não há casos pendentes na fila.');
      return;
    }

    await salvarExecucaoAtiva({
      idExecucao: data.idExecucao,
      geridTabId: aba.id,
      modoTeste,
      tentativasRetomada,
      iniciadoEm: new Date().toISOString(),
    });
    sendLog(modoTeste
      ? `Modo teste: processando 1 de ${data.casos.length} caso(s) pendente(s).`
      : `Fila carregada: ${casos.length} casos pendentes.`);

    for (const caso of casos) {
      await salvarExecucaoAtiva({
        idExecucao: data.idExecucao,
        geridTabId: aba.id,
        modoTeste,
        cpfAtual: caso.cpf,
        tentativasRetomada,
        iniciadoEm: new Date().toISOString(),
      });
      sendLog(`Processando: ${caso.nome}`);
      const casoComAnexos = {
        ...caso,
        anexos: await baixarAnexos(apiUrl, apiToken, data.idExecucao, caso.anexos),
      };
      const resultado = await executarCasoNoGerid(aba.id, casoComAnexos);

      if (resultado.status === 'erro' && !erroDefinitivoDoRequerente(resultado)) {
        const proximaTentativa = tentativasRetomada + 1;
        manterExecucaoPendente = true;
        await salvarExecucaoAtiva({
          idExecucao: data.idExecucao,
          geridTabId: aba.id,
          modoTeste,
          cpfAtual: caso.cpf,
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
      await enviarResultado(apiUrl, apiToken, data.idExecucao, caso, resultado);

      // Revisão é uma parada intencional: preserva a tela preenchida para o
      // operador e nunca abre outro requerimento por cima dela.
      if (resultado.status === 'revisao') {
        sendLog('Pausa segura para revisão humana. Nenhum requerimento foi confirmado automaticamente.');
        break;
      }
    }
  } catch (erro) {
    sendLog(`Erro fatal: ${erro?.message || erro}`);
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
      .then(() => processQueue(request.apiUrl, request.apiToken, modoTeste));
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'content_log') sendLog(msg.message);
});

chrome.runtime.onStartup.addListener(() => {
  void retomarExecucaoPersistida();
});
chrome.alarms?.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_RETOMADA) void retomarExecucaoPersistida();
});
void retomarExecucaoPersistida();
