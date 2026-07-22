'use client';

import { useEffect, useState } from 'react';
import { Icone } from '@/components/ui/Icone';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function alternar() {
    const novo = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', novo);
    try {
      localStorage.setItem('tema', novo ? 'dark' : 'light');
    } catch {
      // localStorage indisponível — ignora
    }
    setDark(novo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Alternar tema claro/escuro"
      className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <Icone nome={dark ? 'sol' : 'lua'} />
    </button>
  );
}
