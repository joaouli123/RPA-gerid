import { NextResponse } from 'next/server';
import { getResultado, recarregarResultado, usandoDadosReais } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Resultado atual da leitura (Módulo 1). */
export async function GET() {
  const resultado = await getResultado();
  return NextResponse.json({ resultado, fonte: usandoDadosReais() ? 'google' : 'exemplo' });
}

/** Força reler o Drive + a planilha. */
export async function POST() {
  try {
    const resultado = await recarregarResultado();
    return NextResponse.json({ resultado, fonte: usandoDadosReais() ? 'google' : 'exemplo' });
  } catch (erro: unknown) {
    return NextResponse.json(
      {
        erro: 'falha_na_leitura',
        mensagem: erro instanceof Error ? erro.message : 'Erro desconhecido.',
      },
      { status: 500 },
    );
  }
}
