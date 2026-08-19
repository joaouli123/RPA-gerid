document.addEventListener('DOMContentLoaded', () => {
  const API_URL_PADRAO = 'https://fabriciodouglas.net';
  const btnStart = document.getElementById('btnStart');
  const btnPausa = document.getElementById('btnPausa');
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
    // `=== true`, e nao `!== false`. A diferenca e o dia inteiro do operador:
    // com `!== false`, storage vazio virava modo teste LIGADO, e modo teste
    // processa so o primeiro caso da fila. O robo protocolava um, parava, e
    // alguem tinha que clicar em Iniciar de novo — parecia trava, era opcao.
    // Padrao de robo de fila e trabalhar a fila inteira; testar e que e o
    // pedido especial, e pedido especial se marca na mao.
    modoTesteInput.checked = result.modoTeste === true;
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

  // Espelho do estado do servidor, nunca a fonte da verdade: quem manda e a
  // resposta de /api/ext/fila. Comeca `false` so para o primeiro render.
  let pausada = false;

  function renderPausa(temExecucao) {
    btnPausa.hidden = !temExecucao;
    btnPausa.innerText = pausada ? 'Retomar fila' : 'Pausar fila';
    btnPausa.disabled = false;
  }

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

      // A pausa vem do SERVIDOR, nao de uma flag local: e o mesmo estado que o
      // painel mostra. So aparece quando existe execucao aberta para pausar.
      pausada = Boolean(data.pausada);
      renderPausa(Boolean(data.idExecucao));
      if (pausada) {
        statusLabel.innerText = 'Fila pausada — casos aguardando:';
        countLabel.innerText = String(data.pendentes ?? '-');
        btnStart.disabled = true;
        return;
      }

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
      // Sem resposta do servidor nao da para saber se esta pausado; esconder o
      // botao e melhor do que oferecer um "Retomar" que talvez nem chegue la.
      renderPausa(false);
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

  btnPausa.addEventListener('click', async () => {
    const salvoToken = await chrome.storage.local.get(['apiToken']);
    const apiToken = salvoToken.apiToken?.trim();
    if (!apiToken) {
      await checkQueue();
      return;
    }
    const alvo = !pausada;
    btnPausa.disabled = true;
    try {
      const res = await fetch(apiUrlInput.value.replace(/\/$/, '') + '/api/ext/pausa', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pausar: alvo }),
      });
      const dados = await res.json().catch(() => null);
      if (!res.ok || !dados?.sucesso) {
        throw new Error(dados?.erro || `Servidor respondeu HTTP ${res.status}.`);
      }
      log(alvo
        ? 'Fila pausada. O caso que ja estava na tela do GERID termina antes de parar.'
        : 'Fila retomada. Clique em Iniciar para continuar de onde parou.');
    } catch (e) {
      log('Nao consegui alterar a pausa: ' + e.message);
    } finally {
      // O estado real vem do servidor — nunca do que este popup achou que fez.
      await checkQueue();
    }
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
