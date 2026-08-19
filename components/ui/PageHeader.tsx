import type { ReactNode } from 'react';

export function PageHeader({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descricao && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{descricao}</p>
        )}
      </div>
      {acao}
    </div>
  );
}
