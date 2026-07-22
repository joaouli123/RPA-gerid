import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{titulo}</h2>
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
