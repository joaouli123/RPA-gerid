import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';

export function AppShell({ children }: { children: ReactNode }) {
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
