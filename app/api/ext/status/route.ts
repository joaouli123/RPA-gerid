import { NextResponse } from 'next/server';
import {
  anexarComprovanteAoCaso,
  arquivarComprovante,
  atualizarStatusCaso,
  finalizarExecucao,
  getExecucaoAtual,
} from '@/lib/server/store';
import { revalidatePath } from 'next/cache';
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

    // O comprovante vai para a PASTA DO CLIENTE no Drive — é lá que o
    // escritório procura. `arquivarComprovante` tenta o Drive e só cai para o
    // disco local quando a credencial não pode criar arquivo; o motivo volta
    // num aviso, que é anexado ao caso para o operador ler no painel.
    let avisoComprovante = '';
    // Confirmacao que volta para a extensao. Nao decide nada no servidor: serve
    // para o operador ver no log se o comprovante chegou aos DOIS lugares, em
    // vez de supor que chegou.
    const confirmacao = { painel: false, drive: false, aviso: '' };
    if (status === 'sucesso' && pdfBase64) {
      let buffer: Buffer | null = null;
      let origem: { destino: 'drive' | 'local'; referencia: string } | null = null;
      try {
        buffer = Buffer.from(pdfBase64, 'base64');
        if (!buffer.byteLength) throw new Error('Comprovante veio vazio.');
        if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('Comprovante excede 20 MB.');
        const salvo = await arquivarComprovante(cpf, buffer);
        origem = { destino: salvo.destino, referencia: salvo.referencia };
        confirmacao.drive = salvo.destino === 'drive';
        avisoComprovante = salvo.aviso
          ? `Comprovante: ${salvo.aviso}`
          : `Comprovante salvo no Drive do cliente (${salvo.referencia}).`;
      } catch (e) {
        console.error('Erro ao salvar PDF do comprovante:', e);
        // Falha ao arquivar NÃO desfaz o protocolo: o requerimento entrou de
        // qualquer forma. Vira aviso para o operador salvar à mão.
        avisoComprovante =
          `Comprovante NÃO arquivado: ${e instanceof Error ? e.message : 'erro desconhecido'}.`;
      }

      // Cópia do painel, ALÉM do Drive — e em bloco separado de propósito: o
      // que pode falhar acima é justamente o Drive, e é nessa hora que ter o
      // PDF na tela da execução mais importa. Só o buffer é pré-requisito.
      if (buffer?.byteLength) {
        try {
          const nome = typeof pdfNome === 'string' && pdfNome.trim()
            ? pdfNome.trim()
            : `comprovante ${String(protocolo || '').trim()}.pdf`;
          const anexado = await anexarComprovanteAoCaso(idExecucao, cpf, buffer, nome, {
            destino: origem?.destino ?? 'local',
            referencia: origem?.referencia ?? 'nao arquivado fora do painel',
          });
          confirmacao.painel = Boolean(anexado);
          if (anexado) avisoComprovante += ' Disponível para download no painel.';
        } catch (e) {
          console.error('Erro ao anexar o comprovante ao painel:', e);
          avisoComprovante += ` Cópia do painel falhou: ${
            e instanceof Error ? e.message : 'erro desconhecido'
          }.`;
        }
      }
    }

    await atualizarStatusCaso(
      idExecucao,
      cpf,
      status,
      [motivoErro, avisoComprovante].filter(Boolean).join(' | ') || undefined,
      protocolo,
    );

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

    confirmacao.aviso = avisoComprovante;
    return NextResponse.json({ sucesso: true, comprovante: confirmacao }, { headers: corsHeaders });
  } catch (error) {
    console.error('Erro na API de status:', error);
    return NextResponse.json({ 
      sucesso: false, 
      erro: error instanceof Error ? error.message : 'Erro interno' 
    }, { status: 500, headers: corsHeaders });
  }
}
