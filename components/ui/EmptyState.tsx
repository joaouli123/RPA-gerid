import type { ReactNode } from 'react';

export function EmptyState({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="font-medium text-zinc-700 dark:text-zinc-200">{titulo}</p>
      {descricao && <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">{descricao}</p>}
      {children}
    </div>
  );
}
