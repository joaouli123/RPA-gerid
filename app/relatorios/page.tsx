import { getExecucoes } from '@/lib/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge, StatusPill, type Tom } from '@/components/ui/Badge';
import { THead, TBody, Th, Td } from '@/components/ui/Tabela';
import { Icone } from '@/components/ui/Icone';
import type { CasoExecucao } from '@/lib/types';
import { formatarCpf, formatarData } from '@/lib/format';

const TOM_CASO: Record<CasoExecucao['status'], Tom> = {
  pendente: 'cinza',
  processando: 'azul',
  revisao: 'ambar',
  sucesso: 'verde',
  erro: 'vermelho',
};

export const dynamic = 'force-dynamic';

export default async function RelatoriosPage() {
  const execucoes = await getExecucoes();

  return (
    <div className="space-y-6">
      <PageHeader titulo="Relatórios" descricao="Histórico de execuções e comprovantes." />

      {execucoes.length === 0 && (
        <EmptyState
          titulo="Nenhuma execução ainda"
          descricao="Dispare o robô na tela de Execução para gerar o primeiro relatório."
        />
      )}

      <div className="space-y-6">
        {execucoes.map((e) => (
          <Card key={e.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatarData(e.dataISO)}</span>
                </div>
                <div className="text-xs text-zinc-400">
                  {e.total} caso(s) · {e.sucesso} sucesso · {e.erro} erro
                </div>
              </div>
              <div className="flex items-center gap-2">
                {e.erro > 0 ? (
                  <StatusPill tom="ambar">{e.erro} com erro</StatusPill>
                ) : (
                  <StatusPill tom="verde">Tudo ok</StatusPill>
                )}
                <a
                  href={`/api/comprovantes/${e.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Icone nome="documento" className="h-4 w-4" />
                  {/*
                    NÃO chamar de "comprovante": no INSS essa palavra é o
                    recibo do protocolo. Este arquivo é o relatório interno da
                    execução — chamá-lo de comprovante faria alguém achar que
                    houve protocolo onde só houve erro.
                  */}
                  Baixar relatório da execução
                </a>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <THead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>CPF</Th>
                    <Th>Situação</Th>
                    <Th>Detalhe</Th>
                  </tr>
                </THead>
                <TBody>
                  {e.casos.map((c) => (
                    <tr key={c.cpf}>
                      <Td className="font-medium">{c.nome}</Td>
                      <Td className="tabular-nums">{formatarCpf(c.cpf)}</Td>
                      <Td>
                        <StatusPill tom={TOM_CASO[c.status]}>
                          {c.status === 'sucesso' ? 'Protocolado' : c.status === 'erro' ? 'Erro' : c.status}
                        </StatusPill>
                      </Td>
                      <Td className="text-zinc-500 dark:text-zinc-400">
                        {c.protocolo ? (
                          <span className="tabular-nums">Protocolo {c.protocolo}</span>
                        ) : (
                          c.motivoErro ?? '—'
                        )}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
