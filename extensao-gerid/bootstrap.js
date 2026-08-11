const API_URL_GERID = 'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io';

(async () => {
  if (location.origin !== API_URL_GERID) return;

  try {
    const resposta = await fetch(`${API_URL_GERID}/api/ext/bootstrap`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok || !dados?.sucesso || !dados.token) return;

    await chrome.storage.local.set({
      apiUrl: API_URL_GERID,
      apiToken: dados.token,
      autorizacaoAutomaticaEm: new Date().toISOString(),
    });
    chrome.runtime.sendMessage({ action: 'api_auth_ready' }).catch(() => undefined);
  } catch {
    // O popup orienta o operador se o painel ainda nao estiver autenticado.
  }
})();
