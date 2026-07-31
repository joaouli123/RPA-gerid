let isRunning = false;

function sendLog(message) {
  console.log(message);
  chrome.runtime.sendMessage({ action: 'log', message }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start') {
    if (!isRunning) {
      isRunning = true;
      processQueue(request.apiUrl);
    }
  } else if (request.action === 'case_result') {
    // Tratado pelo processQueue que estará aguardando
  }
});

async function processQueue(apiUrl) {
  try {
    sendLog('Iniciando processamento...');
    const url = apiUrl.replace(/\/$/, '') + '/api/ext/fila';
    const res = await fetch(url);
    const data = await res.json();

    if (!data.sucesso || !data.casos) {
      throw new Error(data.erro || 'Erro ao buscar fila');
    }

    const casos = data.casos;
    const idExecucao = data.idExecucao;

    sendLog(`Fila carregada: ${casos.length} casos pendentes.`);

    for (const caso of casos) {
      sendLog(`Processando: ${caso.nome}`);
      
      // Encontra a aba do Gerid
      const tabs = await chrome.tabs.query({ url: "*://novorequerimento.inss.gov.br/*" });
      if (tabs.length === 0) {
        throw new Error("Nenhuma aba do Gerid aberta!");
      }
      const geridTab = tabs[0];
      
      // Injeta o comando para o content script processar o caso
      chrome.tabs.sendMessage(geridTab.id, {
        action: 'process_case',
        caso: caso
      });

      // Aguarda o resultado do content.js (pode demorar minutos)
      const result = await new Promise((resolve) => {
        const listener = (msg, sender) => {
          if (sender.tab?.id === geridTab.id && msg.action === 'case_result') {
            chrome.runtime.onMessage.removeListener(listener);
            resolve(msg);
          } else if (msg.action === 'log') {
            sendLog(msg.message); // repassa logs do content para o popup
          }
        };
        chrome.runtime.onMessage.addListener(listener);
      });

      // Envia resultado para o servidor
      sendLog(`Enviando resultado do ${caso.nome}: ${result.status}`);
      await fetch(apiUrl.replace(/\/$/, '') + '/api/ext/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
