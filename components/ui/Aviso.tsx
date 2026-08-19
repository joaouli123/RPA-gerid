import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icone } from '@/components/ui/Icone';

export type TomAviso = 'info' | 'atencao' | 'erro' | 'ok';

/**
 * A caixa de recado do painel.
 *
 * Existia colada a mao em cada tela — mesma estrutura, cores parecidas mas
 * nunca iguais, e o icone as vezes desalinhado com o texto. Sao dez lugares
 * dizendo a mesma coisa de dez jeitos, e o efeito pratico e que nenhum deles se
 * destaca: quando tudo tem borda colorida, o operador para de distinguir o
 * recado importante do decorativo.
 */
const TONS: Record<TomAviso, { caixa: string; icone: string; nome: 'raio' | 'alerta' | 'x' | 'check' }> = {
  info: {
    caixa: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-100',
    icone: 'text-blue-600 dark:text-blue-400',
    nome: 'raio',
  },
  atencao: {
    caixa: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100',
    icone: 'text-amber-600 dark:text-amber-400',
    nome: 'alerta',
  },
  erro: {
    caixa: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100',
    icone: 'text-rose-600 dark:text-rose-400',
    nome: 'x',
  },
  ok: {
    caixa: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100',
    icone: 'text-emerald-600 dark:text-emerald-400',
    nome: 'check',
  },
};

export function Aviso({
  tom = 'info',
  titulo,
  children,
  acao,
  className,
}: {
  tom?: TomAviso;
  titulo?: string;
  children?: ReactNode;
  /** Botao ou link do lado direito, quando o recado pede uma acao. */
  acao?: ReactNode;
  className?: string;
}) {
  const estilo = TONS[tom];
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3.5 text-sm',
        estilo.caixa,
        className,
      )}
    >
      <Icone nome={estilo.nome} className={cn('mt-0.5 h-4 w-4 shrink-0', estilo.icone)} />
      <div className="min-w-0 flex-1 space-y-1 leading-relaxed">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}
