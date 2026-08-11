import { NextResponse } from 'next/server';
import { salvarClienteNaPlanilha } from '@/lib/server/store';
import type { EntradaCadastro } from '@/src/domain/validacaoCadastro';

export async function POST(req: Request) {
  try {
    const entrada = await req.json() as EntradaCadastro;
    await salvarClienteNaPlanilha(entrada);
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: 'falha_ao_salvar',
        mensagem: erro instanceof Error ? erro.message : 'Nao foi possivel salvar o cliente.',
      },
      { status: 422 },
    );
  }
}
