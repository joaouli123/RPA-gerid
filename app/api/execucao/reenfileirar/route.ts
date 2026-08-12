import { NextResponse } from 'next/server';
import { reenfileirarCaso } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Devolve UM caso parado para a fila, sem destruir a execução.
 *
 * Antes disso a única saída era "Redefinir", que apaga a execução inteira e
 * leva junto o resultado dos outros casos. Aqui só o caso escolhido volta.
 * Quem tem protocolo é recusado pelo store — refazer criaria um segundo
 * requerimento no INSS em nome da mesma pessoa.
 */
export async function POST(requisicao: Request) {
  try {
    const corpo = (await requisicao.json()) as { cpf?: unknown };
    const cpf = typeof corpo.cpf === 'string' ? corpo.cpf : '';
    if (!cpf) {
      return NextResponse.json({ erro: 'Informe o CPF do caso.' }, { status: 400 });
    }
    await reenfileirarCaso(cpf);
    return NextResponse.json({ sucesso: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'Nao foi possivel devolver o caso para a fila.' },
      { status: 400 },
    );
  }
}
