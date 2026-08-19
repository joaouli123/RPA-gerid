'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acaoRegistrarProtocoloManual } from '@/lib/server/actions';
import { Botao } from '@/components/ui/Botao';

/**
 * Conserto para o protocolo que saiu no GERID e não chegou ao histórico.
 *
 * A extensão grava o número DEPOIS de o INSS aceitar o requerimento. Se ela cai
 * nesse intervalo — aba fechada, sessão expirada, GERID lento — o pedido existe
 * lá e some daqui. E some justamente do lugar que a trava anti-duplicidade lê:
 * na rodada seguinte a mesma pessoa é protocolada de novo, e alguém tem que
 * cancelar um BPC na mão.
 *
 * Fica fechado atrás de um link porque não é operação de rotina: digitar número
 * errado aqui é pior do que não digitar nada — o cliente ficaria marcado como
 * resolvido sem ter requerimento nenhum.
 */
export function RegistrarProtocoloManual({ cpf, nome }: { cpf: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-3 text-sm underline underline-offset-4 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Já foi protocolado no GERID e não aparece aqui?
      </button>
    );
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      try {
        await acaoRegistrarProtocoloManual(cpf, nome, numero);
        setAberto(false);
        setNumero('');
        router.refresh();
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível registrar o protocolo.');
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/25 dark:bg-amber-500/10">
      <p className="text-sm font-medium">Registrar protocolo já existente</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Confira o número na lista de tarefas do GERID, na linha de <strong>{nome}</strong>. Depois de
        salvo, o robô para de tentar protocolar esta pessoa — é assim que se evita um segundo pedido.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          inputMode="numeric"
          placeholder="Número do protocolo"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
        />
        <Botao onClick={salvar} disabled={pendente || !numero.trim()}>
          {pendente ? 'Salvando…' : 'Salvar protocolo'}
        </Botao>
        <Botao
          variante="secundario"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
          disabled={pendente}
        >
          Cancelar
        </Botao>
      </div>

      {erro && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
    </div>
  );
}
