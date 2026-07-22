import type { ArquivoInfo, DocumentoEsperado } from '@/src/domain/types';
import { classificarDocumentos } from '@/src/domain/validacaoDocs';
import { Icone } from '@/components/ui/Icone';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { formatarBytes } from '@/lib/format';

export function DocumentosChecklist({
  arquivos,
  documentosEsperados,
  limiteBytes,
}: {
  arquivos: ArquivoInfo[];
  documentosEsperados: DocumentoEsperado[];
  limiteBytes: number;
}) {
  const classificacao = classificarDocumentos(arquivos, documentosEsperados);

  return (
    <ul className="space-y-2">
      {classificacao.map(({ doc, arquivos: casados }) => {
        const presente = casados.length > 0;
        const grande = casados.some((a) => a.tamanhoBytes > limiteBytes);

        // Facultativo ausente não é problema — é só informação.
        const estado = grande
          ? 'alerta'
          : presente
            ? 'ok'
            : doc.obrigatorio
              ? 'ausente'
              : 'neutro';

        return (
          <li
            key={doc.tipo}
            className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <span
              className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
                estado === 'ok' &&
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                estado === 'alerta' &&
                  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                estado === 'ausente' &&
                  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
                estado === 'neutro' && 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800',
              )}
            >
              <Icone
                nome={estado === 'ok' ? 'check' : estado === 'alerta' ? 'alerta' : 'x'}
                className="h-4 w-4"
              />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{doc.rotulo}</span>
                {!doc.obrigatorio && <Badge tom="cinza">facultativo</Badge>}
              </div>

              {presente ? (
                <ul className="mt-1 space-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {casados.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{a.nome}</span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums',
                          a.tamanhoBytes > limiteBytes &&
                            'font-medium text-amber-600 dark:text-amber-400',
                        )}
                      >
                        {formatarBytes(a.tamanhoBytes)}
                        {a.tamanhoBytes > limiteBytes && ' — acima do limite'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className={cn(
                    'mt-1 text-sm',
                    doc.obrigatorio
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-zinc-400 dark:text-zinc-500',
                  )}
                >
                  {doc.obrigatorio
                    ? 'Nenhum arquivo encontrado — obrigatório para protocolar.'
                    : 'Não enviado (não bloqueia o protocolo).'}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
