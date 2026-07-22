import { NextResponse } from 'next/server';
import { getExecucaoAtual } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Progresso da execução em andamento — consultado por polling pela tela. */
export async function GET() {
  return NextResponse.json({ execucao: await getExecucaoAtual() });
}
