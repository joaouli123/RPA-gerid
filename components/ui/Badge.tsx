import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tom = 'verde' | 'ambar' | 'vermelho' | 'azul' | 'cinza';

const TONS: Record<Tom, string> = {
  verde: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  ambar: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  vermelho: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  azul: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  cinza: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700/40 dark:text-zinc-300',
};

const PONTOS: Record<Tom, string> = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-500',
  vermelho: 'bg-rose-500',
  azul: 'bg-blue-500',
  cinza: 'bg-zinc-400',
};

export function Badge({
  tom = 'cinza',
  children,
  className,
}: {
  tom?: Tom;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <Badge tom={tom}>
      <span className={cn('h-1.5 w-1.5 rounded-full', PONTOS[tom])} />
      {children}
    </Badge>
  );
}
