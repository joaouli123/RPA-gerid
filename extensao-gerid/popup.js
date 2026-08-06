document.addEventListener('DOMContentLoaded', () => {
  const API_URL_PADRAO = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';
  const API_URL_LEGADA_RAILWAY = 'https://rpa-gerid-production.up.railway.app';
  const btnStart = document.getElementById('btnStart');
  const statusLabel = document.getElementById('statusLabel');
  const countLabel = document.getElementById('countLabel');
  const apiUrlInput = document.getElementById('apiUrl');
  const logDiv = document.getElementById('log');

  function log(msg) {
    logDiv.innerText = msg + '\n' + logDiv.innerText;
  }

  // Migra automaticamente a configuração que apontava para o Railway.
  chrome.storage.local.get(['apiUrl'], (result) => {
    if (result.apiUrl && result.apiUrl !== API_URL_LEGADA_RAILWAY) {
      apiUrlInput.value = result.apiUrl;
    } else {
      apiUrlInput.value = API_URL_PADRAO;
      chrome.storage.local.set({ apiUrl: API_URL_PADRAO });
    }
    checkQueue();
  });

  apiUrlInput.addEventListener('change', () => {
    chrome.storage.local.set({ apiUrl: apiUrlInput.value });
    checkQueue();
  });

  async function checkQueue() {
    const url = apiUrlInput.value.replace(/\/$/, '') + '/api/ext/fila';
    try {
      log('Buscando fila em ' + url);
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.sucesso && data.casos) {
        const count = data.casos.length;
        countLabel.innerText = count.toString();
        
        if (count > 0) {
          statusLabel.innerText = 'Casos pendentes:';
          btnStart.disabled = false;
        } else {
          statusLabel.innerText = 'Fila vazia!';
          btnStart.disabled = true;
        }
      } else {
        throw new Error(data.erro || 'Erro desconhecido');
      }
    } catch (e) {
      statusLabel.innerText = 'Erro de conexão';
      countLabel.innerText = 'X';
      btnStart.disabled = true;
      log('Erro: ' + e.message);
    }
  }

  btnStart.addEventListener('click', () => {
    btnStart.disabled = true;
    log('Iniciando processamento...');
    chrome.runtime.sendMessage({ action: 'start', apiUrl: apiUrlInput.value });
  });

  // Escuta logs do background
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'log') {
      log(request.message);
    } else if (request.action === 'finished') {
      checkQueue();
    }
  });
});
