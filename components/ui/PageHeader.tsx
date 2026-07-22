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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descricao && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{descricao}</p>
        )}
      </div>
      {acao}
    </div>
  );
}
