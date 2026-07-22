import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'RPA Gerid — Protocolo BPC/LOAS',
  description:
    'Painel de controle do robô que protocola requerimentos de BPC/LOAS no Gerid (INSS/Dataprev).',
};

// Aplica o tema salvo antes da primeira pintura (evita "flash" de tema errado).
const scriptTema = `(function(){try{var t=localStorage.getItem('tema');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
