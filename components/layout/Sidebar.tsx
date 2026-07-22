'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone } from '@/components/ui/Icone';
import { navItens } from '@/components/layout/navItens';
import { cn } from '@/lib/cn';

function ativoEm(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {navItens.map((item) => {
        const ativo = ativoEm(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              ativo
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
            )}
          >
            <Icone nome={item.icone} />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
