import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma';

const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    'bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-500',
  secundario:
    'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  perigo:
    'bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-500',
  fantasma:
    'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50';

type PropsComuns = {
  variante?: VarianteBotao;
  className?: string;
  children: ReactNode;
};

export function Botao({
  variante = 'primario',
  href,
  className,
  children,
  ...props
}: PropsComuns & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classe = cn(BASE, VARIANTES[variante], className);
  if (href) {
    return (
      <Link href={href} className={classe}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classe} {...props}>
      {children}
    </button>
  );
}
