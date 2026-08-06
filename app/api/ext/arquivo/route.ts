import { NextResponse } from 'next/server';
import { baixarArquivoParaExtensao } from '@/lib/server/store';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const idExecucao = url.searchParams.get('execucao');
    const arquivoId = url.searchParams.get('id');
    if (!idExecucao || !arquivoId) {
      return NextResponse.json({ sucesso: false, erro: 'Documento ou execução ausente.' }, { status: 400, headers: corsHeaders });
    }

    const arquivo = await baixarArquivoParaExtensao(idExecucao, arquivoId);
    return new NextResponse(Buffer.from(arquivo.bytes), {
      headers: {
        ...corsHeaders,
        'Content-Type': arquivo.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(arquivo.nome)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (erro) {
    return NextResponse.json(
      { sucesso: false, erro: erro instanceof Error ? erro.message : 'Não foi possível baixar o documento.' },
      { status: 404, headers: corsHeaders },
    );
  }
}
