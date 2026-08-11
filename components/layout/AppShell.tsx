'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';

/** Rotas que não usam o shell (sem menu, sem sessão). */
const SEM_SHELL = ['/login', '/privacidade-extensao'];

/**
 * Client component de propósito: precisa do pathname para esconder o menu na
 * tela de login. Os `children` continuam sendo renderizados no servidor — são
 * passados como prop, não recriados aqui.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (SEM_SHELL.includes(pathname)) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20">
            <Sidebar />
          </div>
        </aside>
        <main className="min-w-0 flex-1 space-y-6">
          <MobileNav />
          {children}
        </main>
      </div>
    </div>
  );
}
