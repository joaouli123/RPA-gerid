import { NextResponse } from 'next/server';
import { registrarSinalExtensao } from '@/lib/server/store';
import type { EstadoGerid } from '@/lib/types';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ESTADOS = new Set<EstadoGerid>([
  'aguardando_extensao',
  'autenticacao_necessaria',
  'autenticado',
  'processando',
  'aguardando_confirmacao',
  'revisao',
]);

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  try {
    const { idExecucao, estadoGerid, detalheGerid } = await req.json();
    if (!idExecucao || !ESTADOS.has(estadoGerid)) {
      return NextResponse.json(
        { sucesso: false, erro: 'Execucao ou estado do GERID invalido.' },
        { status: 400, headers: corsHeaders },
      );
    }

    const detalhe = typeof detalheGerid === 'string' ? detalheGerid.slice(0, 500) : undefined;
    const execucao = await registrarSinalExtensao(idExecucao, estadoGerid, detalhe);
    if (!execucao) {
      return NextResponse.json(
        { sucesso: false, erro: 'Execucao nao encontrada ou encerrada.' },
        { status: 409, headers: corsHeaders },
      );
    }
    return NextResponse.json({ sucesso: true }, { headers: corsHeaders });
  } catch (erro) {
    return NextResponse.json(
      { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro interno.' },
      { status: 500, headers: corsHeaders },
    );
  }
}
