import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type NomeIcone =
  | 'painel'
  | 'clientes'
  | 'execucao'
  | 'revisao'
  | 'relatorios'
  | 'config'
  | 'sol'
  | 'lua'
  | 'raio'
  | 'check'
  | 'x'
  | 'alerta'
  | 'documento'
  | 'grupo'
  | 'recarregar'
  | 'pausa'
  | 'baixar';

const PATHS: Record<NomeIcone, ReactNode> = {
  painel: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17.5" cy="9" r="2" />
      <path d="M16 14.2c2.5 0 4.5 1.6 4.5 4.3" />
    </>
  ),
  execucao: <path d="M8 6.5v11l9-5.5-9-5.5Z" />,
  revisao: (
    <>
      <path d="M4 13l2.5-7h11L20 13" />
      <path d="M4 13v5h16v-5h-4.5a3.5 3.5 0 0 1-7 0H4Z" />
    </>
  ),
  relatorios: (
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 12.5h6M9 15.5h6" />
    </>
  ),
  config: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h7M15 17h5" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="13" cy="17" r="2" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  lua: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  raio: <path d="M13 2.5 5.5 13H11l-1 8.5L18.5 11H13l1-8.5Z" />,
  pausa: <path d="M9.5 5.5v13M14.5 5.5v13" />,
  check: <path d="M5 12.5l4 4 10-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alerta: (
    <>
      <path d="M12 4l9 15.5H3L12 4Z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>
  ),
  documento: (
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
    </>
  ),
  grupo: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </>
  ),
  recarregar: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5V9H15" />
    </>
  ),
  baixar: (
    <>
      <path d="M12 3.5v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
};

export function Icone({ nome, className }: { nome: NomeIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-5 w-5', className)}
      aria-hidden="true"
    >
      {PATHS[nome]}
    </svg>
  );
}
