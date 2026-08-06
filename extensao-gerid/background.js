let isRunning = false;

function sendLog(message) {
  console.log(message);
  chrome.runtime.sendMessage({ action: 'log', message }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start') {
    if (!isRunning) {
      isRunning = true;
      processQueue(request.apiUrl, request.apiToken);
    }
  } else if (request.action === 'case_result') {
    // Tratado pelo processQueue que estará aguardando
  }
});

function headersAutorizacao(apiToken, json = false) {
  const headers = { Authorization: `Bearer ${apiToken}` };
  return json ? { ...headers, 'Content-Type': 'application/json' } : headers;
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
    const res = await fetch(url, { headers: headersAutorizacao(apiToken) });
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

async function processQueue(apiUrl, apiToken) {
  try {
    if (!apiToken) throw new Error('A chave da extensão não foi informada.');
    sendLog('Iniciando processamento...');
    const url = apiUrl.replace(/\/$/, '') + '/api/ext/fila';
    const res = await fetch(url, { headers: headersAutorizacao(apiToken) });
    const data = await res.json();

    if (!res.ok || !data.sucesso || !data.casos) {
      throw new Error(data.erro || 'Erro ao buscar fila');
    }

    const casos = data.casos;
    const idExecucao = data.idExecucao;

    sendLog(`Fila carregada: ${casos.length} casos pendentes.`);

    for (const caso of casos) {
      sendLog(`Processando: ${caso.nome}`);
      const casoComAnexos = {
        ...caso,
        anexos: await baixarAnexos(apiUrl, apiToken, idExecucao, caso.anexos),
      };
      
      // Encontra a aba do Gerid (atendimento, novorequerimento, etc)
      const tabs = await chrome.tabs.query({ url: "*://*.inss.gov.br/*" });
      if (tabs.length === 0) {
        throw new Error("Nenhuma aba do Gerid aberta!");
      }
      // Pega a aba ativa primeiro, se não tiver ativa pega a primeira
      const geridTab = tabs.find(t => t.active) || tabs[0];
      
      // Injeta o content.js programaticamente para garantir que ele exista sem precisar de F5
      try {
        await chrome.scripting.executeScript({
          target: { tabId: geridTab.id },
          files: ['content.js']
        });
        await new Promise(r => setTimeout(r, 500)); // dá um tempinho pra inicializar
      } catch (e) {
        sendLog("Aviso: falha ao injetar script, pode já estar rodando. " + e.message);
      }

      // Aguarda o resultado executando a função diretamente na página (bypass do chrome.tabs.sendMessage que é bugado no v3)
      let result;
      try {
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: geridTab.id },
          func: async (dadosCaso) => {
             // Chama a função global que definimos no index.ts
             return await window.iniciarProcessamento(dadosCaso);
          },
          args: [casoComAnexos]
        });
        
        result = injectionResults[0].result;
        
        if (!result) {
           throw new Error("O script não retornou resultado. A página pode ter recarregado durante a execução.");
        }
      } catch (e) {
        result = { status: 'erro', erro: 'Erro fatal na injeção ou execução: ' + (e.message || e) };
      }

      // Envia resultado para o servidor
      sendLog(`Enviando resultado do ${caso.nome}: ${result.status}` + (result.erro ? ` - ${result.erro}` : ''));
      await fetch(apiUrl.replace(/\/$/, '') + '/api/ext/status', {
        method: 'POST',
        headers: headersAutorizacao(apiToken, true),
        body: JSON.stringify({
          idExecucao,
          cpf: caso.cpf,
          status: result.status,
          motivoErro: result.erro,
          protocolo: result.protocolo,
          pdfBase64: result.pdfBase64,
          pdfNome: result.pdfNome
        })
      });
    }

    sendLog('Todos os casos processados!');
  } catch (e) {
    sendLog('Erro fatal: ' + e.message);
  } finally {
    isRunning = false;
    chrome.runtime.sendMessage({ action: 'finished' }).catch(() => {});
  }
}

// Global listener para logs vindos do content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'log') {
    sendLog(msg.message); // repassa para o popup da extensão
  }
});
