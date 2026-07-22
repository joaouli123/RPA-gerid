import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import type { Tom } from '@/components/ui/Badge';

const COR: Record<Tom, string> = {
  verde: 'text-emerald-600 dark:text-emerald-400',
  ambar: 'text-amber-600 dark:text-amber-400',
  vermelho: 'text-rose-600 dark:text-rose-400',
  azul: 'text-blue-600 dark:text-blue-400',
  cinza: 'text-zinc-900 dark:text-zinc-100',
};

export function StatCard({
  rotulo,
  valor,
  tom = 'cinza',
  dica,
  icone,
}: {
  rotulo: string;
  valor: ReactNode;
  tom?: Tom;
  dica?: string;
  icone?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">{rotulo}</div>
        {icone && <div className="text-zinc-400">{icone}</div>}
      </div>
      <div className={cn('mt-1 text-3xl font-semibold tabular-nums', COR[tom])}>{valor}</div>
      {dica && <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{dica}</div>}
    </Card>
  );
}
