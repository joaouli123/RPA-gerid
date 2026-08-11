import { NextResponse } from 'next/server';
import { iniciarExecucao } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Inicia uma execucao que sera consumida pela extensao autenticada no GERID.
 */
export async function POST() {
  try {
    const execucao = await iniciarExecucao();
    return NextResponse.json(
      { execucao, simulado: false, executor: 'extensao' },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (erro: unknown) {
    return NextResponse.json(
      {
        erro: 'falha_ao_iniciar',
        mensagem: erro instanceof Error ? erro.message : 'Erro desconhecido.',
      },
      { status: 500 },
    );
  }
}
