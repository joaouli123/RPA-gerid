import { NextResponse, type NextRequest } from 'next/server';
import { getAcoesRevisao, limparAcaoRevisao, registrarAcaoRevisao } from '@/lib/server/store';
import type { AcaoRevisao } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ACOES_VALIDAS: AcaoRevisao[] = ['resolvido', 'reprocessar'];

export async function GET() {
  return NextResponse.json(await getAcoesRevisao());
}

/** Registra uma ação na fila de revisão (resolvido / reprocessar). */
export async function POST(req: NextRequest) {
  const { chave, acao } = (await req.json()) as { chave?: string; acao?: AcaoRevisao };

  if (!chave || !acao || !ACOES_VALIDAS.includes(acao)) {
    return NextResponse.json(
      { erro: 'validacao', mensagem: `Informe "chave" e "acao" (${ACOES_VALIDAS.join(' | ')}).` },
      { status: 400 },
    );
  }

  await registrarAcaoRevisao(chave, acao);
  return NextResponse.json(await getAcoesRevisao());
}

/** Remove a ação registrada (desfazer). */
export async function DELETE(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave');
  if (!chave) {
    return NextResponse.json(
      { erro: 'validacao', mensagem: 'Informe ?chave=...' },
      { status: 400 },
    );
  }
  await limparAcaoRevisao(chave);
  return NextResponse.json(await getAcoesRevisao());
}
