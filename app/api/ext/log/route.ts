import { NextResponse } from 'next/server';
import { registrarEventosExecucao } from '@/lib/server/store';
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
 * Recebe o diario de bordo da extensao.
 *
 * Ate 19/08/2026 o robo so contava o que fazia no popup do Chrome, que morre
 * junto com o service worker e so existe na maquina do operador. O painel via
 * "Processando" e nada mais — e quando o robo parava, ninguem sabia onde.
 *
 * A rota e deliberadamente burra e nunca devolve erro para o robo: relato e
 * observacao, e observacao que atrapalha o trabalho observado nao serve. Lote
 * malformado ou execucao ja encerrada respondem 200 com `sucesso: false`, e a
 * extensao simplesmente descarta e segue protocolando.
 */
export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json(
      { sucesso: false, erro: auth.erro },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const { idExecucao, eventos } = await req.json();
    if (!idExecucao) {
      return NextResponse.json({ sucesso: false, erro: 'Execucao nao informada.' }, { headers: corsHeaders });
    }
    const guardou = await registrarEventosExecucao(String(idExecucao), eventos);
    return NextResponse.json({ sucesso: guardou }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ sucesso: false }, { headers: corsHeaders });
  }
}
