import { NextResponse } from 'next/server';
import { definirPausaExecucao } from '@/lib/server/store';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Pausa/retoma a fila a partir da EXTENSÃO.
 *
 * É o mesmo estado que o botão do painel altera — de propósito. Se a extensão
 * guardasse uma pausa própria, o painel mostraria "rodando" enquanto nada anda,
 * e o operador perderia tempo procurando o problema no lugar errado.
 */
export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  try {
    const { pausar } = (await req.json()) as { pausar?: unknown };
    if (typeof pausar !== 'boolean') {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe pausar: true ou false.' },
        { status: 400, headers: corsHeaders },
      );
    }

    const execucao = await definirPausaExecucao(pausar);
    return NextResponse.json(
      { sucesso: true, pausada: Boolean(execucao?.pausadaEm) },
      { headers: corsHeaders },
    );
  } catch (erro) {
    return NextResponse.json(
      { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro interno.' },
      { status: 400, headers: corsHeaders },
    );
  }
}
