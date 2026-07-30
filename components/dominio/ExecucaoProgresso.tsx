'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CasoExecucao, ExecucaoAtual } from '@/lib/types';
import { acaoIniciarExecucao, acaoLimparExecucao } from '@/lib/server/actions';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { StatusPill, type Tom } from '@/components/ui/Badge';
import { Icone } from '@/components/ui/Icone';
import { cn } from '@/lib/cn';
import { formatarCpf } from '@/lib/format';

const TOM_CASO: Record<CasoExecucao['status'], Tom> = {
  pendente: 'cinza',
  processando: 'azul',
  sucesso: 'verde',
  erro: 'vermelho',
};

const ROTULO_CASO: Record<CasoExecucao['status'], string> = {
  pendente: 'Na fila',
  processando: 'Processando',
  sucesso: 'Protocolado',
  erro: 'Erro',
};

export function ExecucaoProgresso({
  inicial,
  prontos,
  geridPronto,
}: {
  inicial: ExecucaoAtual | null;
  prontos: { cpf: string; nome: string }[];
  /** false enquanto o preenchimento automático no Gerid não está no ar. */
  geridPronto: boolean;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState<ExecucaoAtual | null>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, startTransition] = useTransition();

  const casos: CasoExecucao[] =
    atual?.casos ?? prontos.map((p) => ({ ...p, status: 'pendente' as const }));
  const rodando = atual?.status === 'rodando';
  const concluida = atual?.status === 'concluida';

  const concluidos = casos.filter((c) => c.status === 'sucesso' || c.status === 'erro').length;
  const progresso = casos.length > 0 ? Math.round((concluidos / casos.length) * 100) : 0;

  const buscarProgresso = useCallback(async (): Promise<ExecucaoAtual | null> => {
    const res = await fetch('/api/execucao/atual', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Falha ao consultar progresso (HTTP ${res.status})`);
    const dados = (await res.json()) as { execucao: ExecucaoAtual | null };
    setAtual(dados.execucao);
    return dados.execucao;
  }, []);

  // Enquanto o job roda no servidor, consulta o progresso periodicamente.
  useEffect(() => {
    if (!rodando) return;
    const timer = setInterval(() => {
      buscarProgresso().catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : 'Falha ao consultar o progresso.');
      });
    }, 800);
    return () => clearInterval(timer);
  }, [rodando, buscarProgresso]);

  // Quando termina, atualiza as outras telas (histórico/relatórios).
  useEffect(() => {
    if (concluida) router.refresh();
  }, [concluida, router]);

  function disparar() {
    if (!geridPronto) return; // trava extra: sem Gerid pronto, não dispara.
    setErro(null);
    startTransition(async () => {
      try {
        await acaoIniciarExecucao();
        await buscarProgresso();
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível iniciar a execução.');
      }
    });
  }

  function limpar() {
    setErro(null);
    startTransition(async () => {
      try {
        await acaoLimparExecucao();
        setAtual(null);
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível limpar a execução.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {geridPronto ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Faça login no Gerid antes de disparar.</strong> O robô abre o navegador
            reaproveitando a sessão já autenticada e protocola de verdade. Um caso só aparece como
            <strong> Protocolado</strong> quando o Gerid devolve o número do protocolo — nunca por
            suposição. Qualquer problema vira <strong>Erro</strong> com o motivo.
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
          <Icone nome="raio" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>O preenchimento automático no Gerid ainda está em desenvolvimento.</strong> Esta
            é a última etapa e entra em breve, depois de um teste acompanhado. Por enquanto o
            sistema já <strong>lê a pasta e a planilha</strong>, <strong>confere os documentos</strong>{' '}
            e <strong>separa os casos prontos dos que precisam de revisão</strong> — o botão abaixo
            é liberado quando o robô estiver pronto para protocolar.
          </div>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <Icone nome="x" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{erro}</div>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              Casos prontos para protocolar
            </div>
            <div className="text-2xl font-semibold tabular-nums">{casos.length}</div>
          </div>
          <div className="flex items-center gap-2">
            {rodando && <StatusPill tom="azul">Executando</StatusPill>}
            {concluida && <StatusPill tom="verde">Concluída</StatusPill>}
            {!rodando && casos.some((c) => c.status !== 'pendente') && (
              <Botao
                variante="fantasma"
                onClick={limpar}
                disabled={iniciando}
              >
                Limpar Histórico
              </Botao>
            )}
            <Botao
              onClick={disparar}
              disabled={!geridPronto || rodando || iniciando || casos.length === 0}
            >
              <Icone nome="raio" className="h-4 w-4" />
              {!geridPronto
                ? 'Em desenvolvimento'
                : rodando
                  ? 'Executando…'
                  : iniciando
                    ? 'Iniciando…'
                    : concluida
                      ? 'Executar de novo'
                      : 'Disparar robô'}
            </Botao>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>
              {concluidos} de {casos.length}
            </span>
            <span>{progresso}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                concluida ? 'bg-emerald-500' : 'bg-blue-600',
              )}
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      </Card>

      <ul className="space-y-2">
        {casos.map((c) => (
          <li
            key={c.cpf}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <div>
              <div className="font-medium">{c.nome}</div>
              <div className="text-xs tabular-nums text-zinc-400">{formatarCpf(c.cpf)}</div>
            </div>
            <div className="flex items-center gap-3">
              {c.protocolo && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Protocolo <span className="font-medium tabular-nums">{c.protocolo}</span>
                </span>
              )}
              {c.motivoErro && (
                <span className="text-xs text-rose-600 dark:text-rose-400">{c.motivoErro}</span>
              )}
              <StatusPill tom={TOM_CASO[c.status]}>{ROTULO_CASO[c.status]}</StatusPill>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
