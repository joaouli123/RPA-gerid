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
 * Import dinâmico e erro contido de propósito: se o Baileys falhar em carregar,
 * o health check ainda precisa responder "ok", senão o Coolify derruba o
 * contêiner inteiro por causa do WhatsApp.
 *
 * Contido não quer dizer escondido. A falha era engolida sem uma linha sequer, e
 * o resultado é que "módulo não carrega" e "ninguém pareou ainda" produziam
 * exatamente o mesmo log: nenhum. Da parte de fora as duas viram a mesma frase
 * do operador — "não chegou mensagem no meu WhatsApp" — e não havia como separar
 * uma da outra sem entrar no contêiner.
 */
let jaContou = false;

async function religarWhatsapp(): Promise<void> {
  try {
    const { manterConexaoViva } = await import('@/lib/server/whatsapp');
    await manterConexaoViva();
  } catch (erro) {
    // Uma vez por processo: esta rota é chamada de 5 em 5 segundos, para sempre.
    if (jaContou) return;
    jaContou = true;
    const causa = erro instanceof Error ? erro.message : String(erro);
    console.log(`[WhatsApp] A ponte nem chegou a carregar: ${causa}`);
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
