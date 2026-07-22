'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { acaoEntrar } from '@/lib/server/acoesAuth';
import { Icone } from '@/components/ui/Icone';

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function LoginForm() {
  const [estado, acao] = useActionState(acaoEntrar, null);

  return (
    <form action={acao} className="space-y-3">
      {estado?.erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{estado.erro}</span>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Senha</span>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <BotaoEntrar />
    </form>
  );
}
