import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import '@/styles/globals.css';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'RPA Gerid — Protocolo BPC/LOAS',
  description:
    'Painel de controle do robô que protocola requerimentos de BPC/LOAS no Gerid (INSS/Dataprev).',
};

// Aplica o tema salvo antes da primeira pintura (evita "flash" de tema errado).
const scriptTema = `(function(){try{var t=localStorage.getItem('tema');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce gerado pelo middleware: sem ele a CSP bloqueia este script.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/*
          `suppressHydrationWarning`: depois de aplicar a CSP o navegador zera o
          atributo `nonce` do DOM (de propósito, para que script injetado não
          consiga lê-lo). O React então compara "nonce=abc" (servidor) com
          "" (cliente) e reclama à toa.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: scriptTema }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
