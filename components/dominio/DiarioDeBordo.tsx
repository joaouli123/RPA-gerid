'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventoExecucao, NivelEvento } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Icone } from '@/components/ui/Icone';
import { cn } from '@/lib/cn';

const ESTILO: Record<NivelEvento, { ponto: string; texto: string }> = {
  info: { ponto: 'bg-zinc-300 dark:bg-zinc-600', texto: 'text-zinc-600 dark:text-zinc-300' },
  aviso: { ponto: 'bg-amber-500', texto: 'text-amber-700 dark:text-amber-300' },
  erro: { ponto: 'bg-rose-500', texto: 'text-rose-700 dark:text-rose-300' },
  sucesso: { ponto: 'bg-emerald-500', texto: 'text-emerald-700 dark:text-emerald-300' },
};

function hora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '--:--:--';
  return data.toLocaleTimeString('pt-BR', { hour12: false });
}

/**
 * O diario de bordo do robo, dentro do painel.
 *
 * Antes disto o relato existia so no popup do Chrome: morria com o service
 * worker e so podia ser lido na maquina que estava rodando. Quem abria o painel
 * via "Processando" e mais nada, e quando o robo parava a tela nao dizia onde
 * nem por que — diagnosticar era pedir print ao operador.
 *
 * Duas decisoes que parecem detalhe e nao sao:
 *
 * O filtro nasce em "so o que importa". A rodada inteira sao centenas de linhas
 * de "abri a aba", "cliquei em avancar", e quem chega aqui quase sempre chega
 * atras de UMA linha. Mostrar tudo por padrao seria esconder a resposta dentro
 * da propria resposta — mas o "Tudo" fica a um clique, porque o passo a passo e
 * o que permite reconstruir uma parada estranha.
 *
 * E o botao de copiar: o operador nao vai transcrever trinta linhas para pedir
 * ajuda. Sem ele, o relato existe mas nao chega a quem conserta.
 */
export function DiarioDeBordo({
  eventos,
  ativo,
}: {
  eventos: EventoExecucao[];
  /** Execucao em andamento — muda o texto de quando a lista esta vazia. */
  ativo: boolean;
}) {
  const [tudo, setTudo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const colado = useRef(true);

  const visiveis = useMemo(
    () => (tudo ? eventos : eventos.filter((e) => e.nivel !== 'info')),
    [eventos, tudo],
  );

  // Acompanha o robo sozinho, mas SO enquanto o operador nao rolou para cima.
  // Puxar a tela de volta para baixo enquanto alguem le uma linha antiga e a
  // forma mais rapida de tornar um log ao vivo inutilizavel.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  });

  useEffect(() => {
    if (colado.current) fim.current?.scrollIntoView({ block: 'nearest' });
  }, [visiveis.length]);

  async function copiar() {
    const texto = eventos.map((e) => `${hora(e.em)}  ${e.mensagem}`).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissao de area de transferencia o botao simplesmente nao
      // confirma. Nada quebra, e o texto continua selecionavel na tela.
    }
  }

  const escondidas = eventos.length - visiveis.length;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">O que o robô está fazendo</h3>
          {ativo && (
            <span className="relative flex h-2 w-2" title="Recebendo do robô agora">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          )}
          <span className="text-xs tabular-nums text-zinc-400">{eventos.length} linhas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
            {[
              { id: false, rotulo: 'Só o que importa' },
              { id: true, rotulo: 'Tudo' },
            ].map((opcao) => (
              <button
                key={String(opcao.id)}
                type="button"
                onClick={() => setTudo(opcao.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition',
                  tudo === opcao.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100',
                )}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copiar}
            disabled={eventos.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Icone nome="documento" className="h-3.5 w-3.5" />
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {eventos.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {ativo
            ? 'A fila está montada. Assim que a extensão começar a trabalhar, cada passo aparece aqui.'
            : 'Nenhuma rodada em andamento. Quando o robô rodar, o relato dele fica registrado aqui — inclusive onde parou.'}
        </p>
      ) : (
        <div ref={caixa} className="max-h-[26rem] overflow-y-auto px-5 py-3">
          <ol className="space-y-1.5">
            {visiveis.map((evento, i) => (
              <li key={`${evento.em}-${i}`} className="flex items-start gap-3 text-sm">
                <span className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400">
                  {hora(evento.em)}
                </span>
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    ESTILO[evento.nivel].ponto,
                  )}
                />
                <span className={cn('min-w-0 flex-1 break-words', ESTILO[evento.nivel].texto)}>
                  {evento.passo && (
                    <span className="mr-1.5 rounded border border-zinc-200 px-1 py-px text-[11px] font-medium tabular-nums text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      passo {evento.passo}
                    </span>
                  )}
                  {evento.mensagem}
                </span>
              </li>
            ))}
          </ol>
          <div ref={fim} />
        </div>
      )}

      {escondidas > 0 && !tudo && (
        <button
          type="button"
          onClick={() => setTudo(true)}
          className="w-full border-t border-zinc-200 px-5 py-2.5 text-xs text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
        >
          + {escondidas} passo{escondidas > 1 ? 's' : ''} de rotina escondido
          {escondidas > 1 ? 's' : ''} — mostrar tudo
        </button>
      )}
    </Card>
  );
}
