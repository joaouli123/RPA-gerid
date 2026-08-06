document.addEventListener('DOMContentLoaded', () => {
  const API_URL_PADRAO = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';
  const btnStart = document.getElementById('btnStart');
  const statusLabel = document.getElementById('statusLabel');
  const countLabel = document.getElementById('countLabel');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiTokenInput = document.getElementById('apiToken');
  const logDiv = document.getElementById('log');

  function log(msg) {
    logDiv.innerText = msg + '\n' + logDiv.innerText;
  }

  // Migra automaticamente a configuração que apontava para o Railway.
  chrome.storage.local.get(['apiUrl', 'apiToken'], (result) => {
    if (result.apiUrl && !/\.railway\.app(?:\/|$)/i.test(result.apiUrl)) {
      apiUrlInput.value = result.apiUrl;
    } else {
      apiUrlInput.value = API_URL_PADRAO;
      chrome.storage.local.set({ apiUrl: API_URL_PADRAO });
    }
    if (result.apiToken) apiTokenInput.value = result.apiToken;
    checkQueue();
  });

  function salvarConfiguracao() {
    chrome.storage.local.set({ apiUrl: apiUrlInput.value, apiToken: apiTokenInput.value });
  }

  apiUrlInput.addEventListener('change', () => {
    salvarConfiguracao();
    checkQueue();
  });
  apiTokenInput.addEventListener('change', () => {
    salvarConfiguracao();
    checkQueue();
  });

  async function checkQueue() {
    const url = apiUrlInput.value.replace(/\/$/, '') + '/api/ext/fila';
    try {
      if (!apiTokenInput.value.trim()) throw new Error('Informe a chave da extensão configurada no Coolify.');
      log('Buscando fila em ' + url);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiTokenInput.value.trim()}` } });
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
    chrome.runtime.sendMessage({
      action: 'start',
      apiUrl: apiUrlInput.value,
      apiToken: apiTokenInput.value.trim(),
    });
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
