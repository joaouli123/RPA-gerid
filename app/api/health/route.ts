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

export async function GET(): Promise<Response> {
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
