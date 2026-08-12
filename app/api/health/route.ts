export const dynamic = 'force-dynamic';

/**
 * Saúde + carimbo do build.
 *
 * `commit` existe para responder "a produção está atualizada?" sem depender de
 * ninguém lembrar se clicou em Deploy. O valor vem do `SOURCE_COMMIT` que o
 * Coolify passa no build (ver Dockerfile); fora dele fica "desconhecido".
 *
 * Só entra aqui o que é público por natureza: o SHA é um hash opaco e o
 * horário de início do processo. Nada de env, caminho de arquivo ou config —
 * esta rota é a ÚNICA da API que o middleware libera sem sessão.
 */
const INICIADO_EM = new Date().toISOString();

/**
 * Aproveita o health check para manter a ponte de WhatsApp de pé.
 *
 * O Coolify bate nesta rota de tempos em tempos, para sempre — é o único
 * batimento garantido do sistema. Sem ele, a sessão pareada ficava salva em
 * disco mas ninguém a religava: depois de um deploy o painel dizia "não
 * vinculado" até alguém abrir Configurações, e a ponte só subia de verdade no
 * instante em que o GERID pedia o 2FA. Pior momento possível para descobrir que
 * a conexão tinha caído de madrugada.
 *
 * Import dinâmico e erro engolido de propósito: se o Baileys falhar em carregar,
 * o health check ainda precisa responder "ok", senão o Coolify derruba o
 * contêiner inteiro por causa do WhatsApp.
 */
async function religarWhatsapp(): Promise<void> {
  try {
    const { manterConexaoViva } = await import('@/lib/server/whatsapp');
    manterConexaoViva();
  } catch {
    // Sem WhatsApp o robô ainda protocola; só o 2FA fica manual.
  }
}

export async function GET(): Promise<Response> {
  void religarWhatsapp();

  return Response.json(
    {
      status: 'ok',
      release: 'gerid-rpa-1.4.0',
      commit: (process.env.RPA_COMMIT || 'desconhecido').slice(0, 12),
      iniciadoEm: INICIADO_EM,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
