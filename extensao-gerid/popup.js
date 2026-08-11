document.addEventListener('DOMContentLoaded', () => {
  const API_URL_PADRAO = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';
  const btnStart = document.getElementById('btnStart');
  const btnAuth = document.getElementById('btnAuth');
  const authBox = document.getElementById('authBox');
  const authLabel = document.getElementById('authLabel');
  const statusLabel = document.getElementById('statusLabel');
  const countLabel = document.getElementById('countLabel');
  const apiUrlInput = document.getElementById('apiUrl');
  const modoTesteInput = document.getElementById('modoTeste');
  const logDiv = document.getElementById('log');
  const consentBox = document.getElementById('consentBox');
  const btnConsent = document.getElementById('btnConsent');
  document.getElementById('versionLabel').innerText = `v${chrome.runtime.getManifest().version}`;

  function log(msg) {
    logDiv.innerText = msg + '\n' + logDiv.innerText;
  }

  // Migra automaticamente a configuração que apontava para o Railway.
  chrome.storage.local.get(
    [
      'apiUrl',
      'apiToken',
      'modoTeste',
      'estadoAutenticacaoGerid',
      'execucaoAtivaGerid',
      'logsGerid',
      'consentimentoPrivacidadeGerid',
    ],
    (result) => {
    if (result.apiUrl && !/\.railway\.app(?:\/|$)/i.test(result.apiUrl)) {
      apiUrlInput.value = result.apiUrl;
    } else {
      apiUrlInput.value = API_URL_PADRAO;
      chrome.storage.local.set({ apiUrl: API_URL_PADRAO });
    }
    if (Array.isArray(result.logsGerid) && result.logsGerid.length > 0) {
      logDiv.innerText = result.logsGerid
        .slice(0, 20)
        .map((item) => item?.mensagem || String(item))
        .join('\n');
    }
    modoTesteInput.checked = result.modoTeste !== false;
    renderAuth(result.estadoAutenticacaoGerid);
    if (result.execucaoAtivaGerid?.aguardandoConfirmacao) {
      statusLabel.innerText = 'Aguardando confirmação no GERID';
      btnStart.innerText = 'Verificar protocolo';
    }
    if (result.consentimentoPrivacidadeGerid === true) {
      consentBox.hidden = true;
      checkQueue();
    } else {
      consentBox.hidden = false;
      statusLabel.innerText = 'Ativacao necessaria';
      countLabel.innerText = '-';
      btnStart.disabled = true;
    }
    },
  );

  function renderAuth(registro) {
    const autenticado = registro?.estado === 'autenticado';
    authBox.classList.toggle('ok', autenticado);
    authLabel.innerText = registro?.mensagem || 'Autenticação ainda não verificada.';
    btnAuth.innerText = autenticado ? 'Abrir GERID' : 'Abrir autenticação';
  }

  function salvarConfiguracao() {
    chrome.storage.local.set({ apiUrl: apiUrlInput.value, modoTeste: modoTesteInput.checked });
  }

  apiUrlInput.addEventListener('change', () => {
    salvarConfiguracao();
    checkQueue();
  });
  modoTesteInput.addEventListener('change', salvarConfiguracao);

  btnConsent.addEventListener('click', async () => {
    await chrome.storage.local.set({ consentimentoPrivacidadeGerid: true });
    consentBox.hidden = true;
    checkQueue();
  });

  async function checkQueue() {
    const url = apiUrlInput.value.replace(/\/$/, '') + '/api/ext/fila';
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 20_000);
    try {
      const salvoToken = await chrome.storage.local.get(['apiToken']);
      const apiToken = salvoToken.apiToken?.trim();
      if (!apiToken) {
        statusLabel.innerText = 'Conecte-se ao painel';
        countLabel.innerText = '-';
        btnStart.disabled = true;
        log('Abra ou recarregue o painel para autorizar automaticamente.');
        return;
      }
      log('Buscando fila em ' + url);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: controlador.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.erro || `Servidor respondeu HTTP ${res.status}.`);
      }
      if (!data) throw new Error('O servidor retornou uma resposta invalida.');
      const salvo = await chrome.storage.local.get(['execucaoAtivaGerid']);
      const aguardandoConfirmacao = salvo.execucaoAtivaGerid?.aguardandoConfirmacao;
      
      if (data.sucesso && data.casos) {
        const count = data.casos.length;
        countLabel.innerText = count.toString();
        
        if (aguardandoConfirmacao) {
          statusLabel.innerText = 'Aguardando confirmação no GERID';
          btnStart.innerText = 'Verificar protocolo';
          btnStart.disabled = false;
        } else if (count > 0) {
          statusLabel.innerText = 'Casos pendentes:';
          btnStart.innerText = 'Iniciar protocolos';
          btnStart.disabled = false;
        } else if (data.idExecucao) {
          statusLabel.innerText = 'Aguardando confirmação no GERID';
          btnStart.innerText = 'Verificar protocolo';
          btnStart.disabled = false;
        } else {
          statusLabel.innerText = 'Fila ainda não preparada';
          btnStart.innerText = 'Preparar e iniciar';
          btnStart.disabled = false;
        }
      } else {
        throw new Error(data.erro || 'Erro desconhecido');
      }
    } catch (e) {
      statusLabel.innerText = 'Erro de conexão';
      countLabel.innerText = 'X';
      btnStart.disabled = true;
      log('Erro: ' + (e.name === 'AbortError' ? 'a conexao excedeu 20 segundos.' : e.message));
    } finally {
      clearTimeout(temporizador);
    }
  }

  btnStart.addEventListener('click', async () => {
    salvarConfiguracao();
    const salvoToken = await chrome.storage.local.get(['apiToken']);
    const apiToken = salvoToken.apiToken?.trim();
    if (!apiToken) {
      await checkQueue();
      return;
    }
    btnStart.disabled = true;
    chrome.runtime.sendMessage({
      action: 'start',
      apiUrl: apiUrlInput.value,
      apiToken,
      modoTeste: modoTesteInput.checked,
    });
  });

  btnAuth.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'open_auth' });
    window.close();
  });

  // Escuta logs do background
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'log') {
      log(request.message);
    } else if (request.action === 'auth_state') {
      renderAuth(request);
    } else if (request.action === 'finished') {
      checkQueue();
    } else if (request.action === 'api_auth_ready') {
      checkQueue();
    }
  });
});
