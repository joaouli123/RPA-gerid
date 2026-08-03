import { NextResponse } from 'next/server';
import { getExecucao } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Baixa o comprovante consolidado de uma execução (texto).
 * TODO Módulo 3: substituir pelos PDFs reais baixados do Gerid e salvos na
 * pasta do cliente no Drive.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const execucao = await getExecucao(id);

  if (!execucao) {
    return NextResponse.json({ erro: 'nao_encontrado' }, { status: 404 });
  }

  const linhas = [
    'RPA Gerid — comprovante consolidado de execução',
    '='.repeat(60),
    `Execução: ${execucao.id}`,
    `Data: ${execucao.dataISO}`,
    `Total: ${execucao.total} | Sucesso: ${execucao.sucesso} | Erro: ${execucao.erro}`,
    '',
    'Casos:',
    ...execucao.casos.map((c) => {
      const detalhe = c.protocolo
        ? `protocolo ${c.protocolo}`
        : (c.motivoErro ?? 'sem detalhe');
      return `  - ${c.nome} (${c.cpf}) — ${c.status.toUpperCase()} — ${detalhe}`;
    }),
    '',
  ];

  return new NextResponse(linhas.filter((l) => l !== '').join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="comprovante-${execucao.id}.txt"`,
    },
  });
}
