import { NextResponse } from 'next/server';
import { getExecucaoAtual, limparExecucaoAtual } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Progresso da execução em andamento — consultado por polling pela tela. */
export async function GET() {
  return NextResponse.json(
    { execucao: await getExecucaoAtual() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Limpa a execucao atual sem depender de Server Action versionada pelo deploy. */
export async function DELETE() {
  await limparExecucaoAtual();
  return NextResponse.json(
    { sucesso: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
