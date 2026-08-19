// Origens em que o painel pode estar. O endereco automatico do Coolify
// (sslip.io) saiu daqui em 18/08/2026: o escritorio decidiu ficar com UM
// dominio so, e no Coolify aquele endereco deixou de existir. Manter na lista
// um endereco que nao responde mais nao e prudencia, e uma porta aberta para o
// token do painel ser oferecido a quem um dia registrar aquele nome.
const ORIGENS_PAINEL = [
  'https://fabriciodouglas.net',
];

/** Subdominio do escritorio (painel.fabriciodouglas.net, rpa..., etc.). */
const SUFIXO_PAINEL = '.fabriciodouglas.net';

function origemDoPainel(origem) {
  if (ORIGENS_PAINEL.includes(origem)) return true;
  // Precisa comecar com https: sem isso, "http://x.fabriciodouglas.net" passaria,
  // e o token do painel nao pode trafegar em claro.
  return origem.startsWith('https://') && origem.endsWith(SUFIXO_PAINEL);
}

(async () => {
  if (!origemDoPainel(location.origin)) return;
  // A partir daqui o alvo e a origem DESTA aba, e nao uma constante: e o que
  // faz o mesmo arquivo servir ao endereco velho e ao novo sem editar nada.
  const API_URL_GERID = location.origin;

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
