import { NextResponse, type NextRequest } from 'next/server';
import { getConfig, salvarConfig } from '@/lib/server/store';
import type { OverridesConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getConfig());
}

/** Atualiza os campos configuráveis (persistidos em .data/estado.json). */
export async function PUT(req: NextRequest) {
  try {
    const corpo = (await req.json()) as OverridesConfig;

    if (
      corpo.limiteTamanhoArquivoBytes !== undefined &&
      (!Number.isFinite(corpo.limiteTamanhoArquivoBytes) || corpo.limiteTamanhoArquivoBytes <= 0)
    ) {
      return NextResponse.json(
        { erro: 'validacao', mensagem: 'limiteTamanhoArquivoBytes deve ser um número positivo.' },
        { status: 400 },
      );
    }

    await salvarConfig(corpo);
    return NextResponse.json(await getConfig());
  } catch (erro: unknown) {
    return NextResponse.json(
      {
        erro: 'falha_ao_salvar',
        mensagem: erro instanceof Error ? erro.message : 'Erro desconhecido.',
      },
      { status: 500 },
    );
  }
}
