import { NextResponse } from 'next/server';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';
import { iniciarExecucao } from '@/lib/server/store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Prepara a fila a partir da propria extensao, sem exigir um segundo clique no painel. */
export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  try {
    const execucao = await iniciarExecucao();
    return NextResponse.json(
      { sucesso: true, idExecucao: execucao.id, total: execucao.casos.length },
      { status: 202, headers: corsHeaders },
    );
  } catch (erro) {
    return NextResponse.json(
      { sucesso: false, erro: erro instanceof Error ? erro.message : 'Nao foi possivel preparar a fila.' },
      { status: 422, headers: corsHeaders },
    );
  }
}
