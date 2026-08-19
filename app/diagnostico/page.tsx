import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill, type Tom } from '@/components/ui/Badge';
import { THead, TBody, Th, Td } from '@/components/ui/Tabela';
import { listarOcorrencias } from '@/lib/server/diagnostico';
import { formatarCpf } from '@/lib/format';

/**
 * O que deu errado enquanto ninguém estava olhando.
 *
 * O robô roda o dia inteiro sozinho. Toda situação nova que ele encontrar — uma
 * tela do GERID que mudou, um PDF que não baixou, a sessão que caiu de um jeito
 * diferente — acontece sem plateia. Esta tela existe para que, no dia seguinte,
 * exista alguma coisa escrita sobre o que aconteceu.
 *
 * Não é a tela de Execução: aquela mostra o estado de AGORA e some quando a
 * execução fecha. Esta é a série histórica, que é o que permite ver que um erro
 * se repete às terças, ou sempre com o mesmo cliente.
 */
export const dynamic = 'force-dynamic';

const TOM_ETAPA: Record<string, Tom> = {
  antiabuso: 'vermelho',
  comprovante: 'ambar',
  caso: 'ambar',
  fila: 'vermelho',
  ronda: 'cinza',
};

function quando(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default async function DiagnosticoPage() {
  const ocorrencias = await listarOcorrencias(200);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Diagnóstico"
        descricao="Tudo que falhou, com data e hora, para corrigir depois. As mais recentes primeiro."
      />

      {ocorrencias.length === 0 && (
        <EmptyState
          titulo="Nenhuma ocorrência registrada"
          descricao="Nada falhou desde a última limpeza — ou o robô ainda não rodou."
        />
      )}

      {ocorrencias.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <THead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Etapa</Th>
                  <Th>Cliente</Th>
                  <Th>O que aconteceu</Th>
                </tr>
              </THead>
              <TBody>
                {ocorrencias.map((o, i) => (
                  <tr key={`${o.em}-${i}`}>
                    <Td className="whitespace-nowrap tabular-nums text-zinc-500 dark:text-zinc-400">
                      {quando(o.em)}
                    </Td>
                    <Td>
                      <StatusPill tom={TOM_ETAPA[o.etapa] ?? 'cinza'}>{o.etapa}</StatusPill>
                      <span className="ml-2 text-xs text-zinc-400">{o.origem}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {o.nome ? (
                        <>
                          <span className="font-medium">{o.nome}</span>
                          {o.cpf && (
                            <span className="ml-1 tabular-nums text-xs text-zinc-400">
                              {formatarCpf(o.cpf)}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-zinc-600 dark:text-zinc-300">
                      {o.mensagem}
                      {o.detalhe && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-zinc-400">detalhe</summary>
                          <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                            {o.detalhe}
                          </pre>
                        </details>
                      )}
                    </Td>
                  </tr>
                ))}
              </TBody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
