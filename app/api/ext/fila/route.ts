import { NextResponse } from 'next/server';
import { getExecucaoAtual } from '@/lib/server/store';

// Permite chamadas do navegador (CORS) caso a extensão chame diretamente
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    const atual = await getExecucaoAtual();

    // Consultar a fila nunca pode iniciar um protocolo. A extensão chama esta
    // rota ao abrir o popup; uma execução só nasce por ação explícita no painel.
    if (!atual || atual.status !== 'rodando') {
      return NextResponse.json({ sucesso: true, idExecucao: null, casos: [] }, { headers: corsHeaders });
    }

    // Retorna apenas os casos que ainda estão pendentes
    const pendentes = atual.casos.filter(c => c.status === 'pendente' || c.status === 'processando');

    return NextResponse.json({ 
      sucesso: true, 
      idExecucao: atual.id,
      casos: pendentes 
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Erro na API de fila:', error);
    return NextResponse.json({ 
      sucesso: false, 
      erro: error instanceof Error ? error.message : 'Erro interno' 
    }, { status: 500, headers: corsHeaders });
  }
}
