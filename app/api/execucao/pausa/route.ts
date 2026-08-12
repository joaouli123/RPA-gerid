import { NextResponse } from 'next/server';
import { definirPausaExecucao } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Pausa/retoma a fila pelo painel.
 *
 * Fica atrás do middleware de sessão (como toda rota fora de `/api/ext/`), ou
 * seja: só o operador logado pausa. A extensão apenas LÊ esse estado, pelas
 * rotas de fila e heartbeat — ela nunca decide sozinha parar ou voltar.
 */
export async function POST(req: Request) {
  try {
    const { pausar } = (await req.json()) as { pausar?: unknown };
    if (typeof pausar !== 'boolean') {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe pausar: true ou false.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const execucao = await definirPausaExecucao(pausar);
    return NextResponse.json(
      { sucesso: true, execucao },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (erro) {
    return NextResponse.json(
      { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro interno.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
