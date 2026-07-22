import type { Metadata } from 'next';
import { Icone } from '@/components/ui/Icone';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar — RPA Gerid',
  // Tela de acesso a dado sensível: fora de buscadores.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-600 text-white">
            <Icone nome="raio" className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">RPA Gerid</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Acesso restrito. Este sistema trata dados pessoais sensíveis.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Após 5 tentativas erradas o acesso fica bloqueado por 15 minutos.
        </p>
      </div>
    </div>
  );
}
