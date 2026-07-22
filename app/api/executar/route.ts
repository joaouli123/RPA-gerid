import { NextResponse } from 'next/server';
import { iniciarExecucao } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Inicia uma execução. O job roda de verdade no servidor (progresso em
 * /api/execucao/atual), mas o preenchimento no Gerid ainda é SIMULADO —
 * a automação com Playwright é o Módulo 2.
 */
export async function POST() {
  try {
    const execucao = await iniciarExecucao();
    return NextResponse.json({ execucao, simulado: true }, { status: 202 });
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
