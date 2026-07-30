import { NextResponse } from 'next/server';
import { getExecucaoAtual, iniciarExecucao, persistir } from '@/lib/server/store';

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
    let atual = await getExecucaoAtual();
    
    // Se não tiver execução atual rodando, cria uma nova com os clientes prontos
    if (!atual || atual.casos.length === 0) {
      atual = await iniciarExecucao();
    }

    if (atual.status !== 'rodando') {
      atual.status = 'rodando';
      await persistir();
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
