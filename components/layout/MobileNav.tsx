'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone } from '@/components/ui/Icone';
import { navItens } from '@/components/layout/navItens';
import { cn } from '@/lib/cn';

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:hidden">
      {navItens.map((item) => {
        const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              ativo
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
            )}
          >
            <Icone nome={item.icone} className="h-4 w-4" />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
