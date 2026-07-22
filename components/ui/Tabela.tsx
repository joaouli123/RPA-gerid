import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Tabela({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900/40">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</tbody>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;
}
