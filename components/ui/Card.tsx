import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Ate 19/08/2026 o Card nao tinha padding nenhum e cada tela colava um `p-4`
 * na mao. Cinco lugares esqueceram, e nesses o conteudo encostava na borda —
 * incluindo a lista "Ja protocolados" da Execucao. Um container que precisa que
 * o chamador lembre do espacamento vai ter telas desalinhadas por definicao.
 *
 * O padding agora e do container, com escape para os casos legitimos (tabela
 * que vai de borda a borda). `none` e escolha explicita, nao esquecimento.
 */
const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

export function Card({
  children,
  className,
  padding = 'md',
}: {
  children: ReactNode;
  className?: string;
  padding?: keyof typeof PADDING;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
        PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          {descricao && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{descricao}</p>
          )}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
