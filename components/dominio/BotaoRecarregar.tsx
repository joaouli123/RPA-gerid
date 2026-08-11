'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';

/** Re-roda o Módulo 1 (leitura do Drive + planilha) e atualiza todas as telas. */
export function BotaoRecarregar() {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function recarregar() {
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch('/api/resultado', { method: 'POST' });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.mensagem || 'Falha ao recarregar os dados.');
        router.refresh();
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Falha ao recarregar os dados.');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {erro && <span className="text-sm text-rose-600 dark:text-rose-400">{erro}</span>}
      <Botao variante="secundario" onClick={recarregar} disabled={pendente}>
        <Icone nome="recarregar" className="h-4 w-4" />
        {pendente ? 'Relendo…' : 'Recarregar dados'}
      </Botao>
    </div>
  );
}
