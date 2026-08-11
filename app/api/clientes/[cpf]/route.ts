import { NextResponse } from 'next/server';
import { excluirClienteDaPlanilha } from '@/lib/server/store';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ cpf: string }> },
) {
  try {
    const { cpf } = await params;
    await excluirClienteDaPlanilha(cpf);
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: 'falha_ao_excluir',
        mensagem: erro instanceof Error ? erro.message : 'Nao foi possivel excluir o cliente.',
      },
      { status: 422 },
    );
  }
}
