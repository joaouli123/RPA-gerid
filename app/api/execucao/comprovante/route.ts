import { NextResponse } from 'next/server';
import { lerComprovanteDoCaso } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Entrega o PDF do comprovante que a extensão capturou no GERID.
 *
 * `inline` (padrão) abre no visualizador do navegador; `?baixar=1` força o
 * download. Responde 404 quando não há comprovante registrado para o caso —
 * ou quando o registro existe mas o arquivo sumiu. Não inventa PDF vazio.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idExecucao = url.searchParams.get('execucao') ?? '';
  const cpf = url.searchParams.get('cpf') ?? '';
  if (!idExecucao || !cpf) {
    return NextResponse.json({ erro: 'Informe execucao e cpf.' }, { status: 400 });
  }

  const comprovante = await lerComprovanteDoCaso(idExecucao, cpf).catch(() => null);
  if (!comprovante) {
    return NextResponse.json({ erro: 'nao_encontrado' }, { status: 404 });
  }

  const disposicao = url.searchParams.get('baixar') ? 'attachment' : 'inline';
  return new NextResponse(new Uint8Array(comprovante.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposicao}; filename="${comprovante.nome.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
