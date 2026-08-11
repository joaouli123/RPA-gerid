import { NextResponse } from 'next/server';
import { atualizarStatusCaso, finalizarExecucao, getExecucaoAtual } from '@/lib/server/store';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const auth = autorizarExtensao(req);
    if (!auth.ok) {
      return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
    }
    const { idExecucao, cpf, status, motivoErro, protocolo, pdfBase64, pdfNome } = await req.json();

    if (!idExecucao || !cpf || !['sucesso', 'erro', 'revisao'].includes(status)) {
      return NextResponse.json({ sucesso: false, erro: 'Dados incompletos' }, { status: 400, headers: corsHeaders });
    }
    if (status === 'sucesso' && !String(protocolo || '').trim()) {
      return NextResponse.json(
        { sucesso: false, erro: 'Sucesso exige o numero real do protocolo.' },
        { status: 400, headers: corsHeaders },
      );
    }

    // Se a extensão enviar um PDF, salvamos na pasta local
    if (status === 'sucesso' && pdfBase64 && pdfNome) {
      try {
        const outDir = path.join(process.cwd(), 'saida', cpf.replace(/\D/g, ''));
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        
        const buffer = Buffer.from(pdfBase64, 'base64');
        if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('Comprovante excede 20 MB.');
        const nomeSeguro = path.basename(String(pdfNome)).replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!nomeSeguro) throw new Error('Nome de comprovante invalido.');
        fs.writeFileSync(path.join(outDir, nomeSeguro), buffer);
      } catch (e) {
        console.error('Erro ao salvar PDF do comprovante:', e);
      }
    }

    await atualizarStatusCaso(idExecucao, cpf, status, motivoErro, protocolo);

    // Checa se todos terminaram para finalizar a execução
    const atual = await getExecucaoAtual();
    if (atual && atual.id === idExecucao) {
      // Revisao ainda aguarda o clique humano em Confirmar e a captura do
      // protocolo pela extensao. Nao encerre a execucao nessa etapa.
      const todosConcluidos = atual.casos.every(c => c.status === 'sucesso' || c.status === 'erro');
      if (todosConcluidos) {
        await finalizarExecucao(idExecucao);
      }
    }

    // Força atualização da tela do painel
    revalidatePath('/execucao');

    return NextResponse.json({ sucesso: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('Erro na API de status:', error);
    return NextResponse.json({ 
      sucesso: false, 
      erro: error instanceof Error ? error.message : 'Erro interno' 
    }, { status: 500, headers: corsHeaders });
  }
}
