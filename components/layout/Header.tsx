import { Icone } from '@/components/ui/Icone';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white">
            <Icone nome="raio" />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">RPA Gerid</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Protocolo BPC/LOAS</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 sm:inline-flex dark:border-zinc-700 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Gerid: login manual
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
