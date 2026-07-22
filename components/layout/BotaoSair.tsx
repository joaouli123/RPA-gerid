'use client';

import { useTransition } from 'react';
import { acaoSair } from '@/lib/server/acoesAuth';

export function BotaoSair() {
  const [saindo, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          try {
            await acaoSair();
          } catch {
            // redirect() do Next lança um erro de controle — não é falha.
          }
        })
      }
      disabled={saindo}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  );
}
