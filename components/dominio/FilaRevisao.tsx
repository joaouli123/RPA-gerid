'use client';

import { useMemo, useState, useTransition } from 'react';
import type { ClienteRevisao } from '@/src/domain/types';
import type { CodigoMotivo as Codigo } from '@/src/domain/motivos';
import { infoDoMotivo } from '@/lib/motivos';
import type { RegistroAcaoRevisao } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge, type Tom } from '@/components/ui/Badge';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { formatarCpf } from '@/lib/format';

interface ItemFila {
  chave: string;
  pasta: string;
  cpf?: string;
  detalhe: string;
}

/** Chave estável do item (sobrevive a recarregar os dados). */
function chaveItem(codigo: string, pasta: string, cpf?: string): string {
  return `${codigo}|${pasta}|${cpf ?? ''}`;
}

export function FilaRevisao({
  revisao,
  acoes,
}: {
  revisao: ClienteRevisao[];
  acoes: Record<string, RegistroAcaoRevisao>;
}) {
  const [pendente, setPendente] = useState<string | null>(null);
  const [registros, setRegistros] = useState(acoes);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const grupos = useMemo(() => {
    const mapa = new Map<Codigo, ItemFila[]>();
    for (const c of revisao) {
      for (const m of c.motivos) {
        const lista = mapa.get(m.codigo) ?? [];
        lista.push({
          chave: chaveItem(m.codigo, c.pasta, c.cpf),
          pasta: c.pasta,
          cpf: c.cpf,
          detalhe: m.detalhe,
        });
        mapa.set(m.codigo, lista);
      }
    }
    return [...mapa.entries()];
  }, [revisao]);

  function registrar(chave: string, acao: 'resolvido' | 'reprocessar') {
    setPendente(chave);
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch('/api/revisao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chave, acao }),
        });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.mensagem || 'Nao foi possivel salvar a revisao.');
        setRegistros(dados);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Nao foi possivel salvar a revisao.');
      } finally {
        setPendente(null);
      }
    });
  }

  function desfazer(chave: string) {
    setPendente(chave);
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch(`/api/revisao?chave=${encodeURIComponent(chave)}`, {
          method: 'DELETE',
        });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.mensagem || 'Nao foi possivel desfazer a revisao.');
        setRegistros(dados);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Nao foi possivel desfazer a revisao.');
      } finally {
        setPendente(null);
      }
    });
  }

  if (grupos.length === 0) {
    return <EmptyState titulo="Fila vazia" descricao="Nenhum caso em revisão manual." />;
  }

  const totalResolvidos = Object.values(registros).filter((a) => a.acao === 'resolvido').length;

  return (
    <div className="space-y-5">
      {erro && <p className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      {totalResolvidos > 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {totalResolvidos} caso(s) marcados como resolvidos. As marcações ficam salvas.
        </p>
      )}

      {grupos.map(([codigo, itens]) => {
        const info = infoDoMotivo(codigo);
        const tom: Tom = info.tom === 'vermelho' ? 'vermelho' : 'ambar';
        return (
          <Card key={codigo} padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex items-center gap-2">
                <Badge tom={tom}>{info.rotulo}</Badge>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {itens.length} caso(s)
                </span>
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Ação sugerida: {info.acao}
              </div>
            </div>

            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {itens.map((item) => {
                const registro = registros[item.chave];
                const resolvido = registro?.acao === 'resolvido';
                const reprocessar = registro?.acao === 'reprocessar';
                const ocupado = pendente === item.chave;

                return (
                  <li
                    key={item.chave}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div className={cn('min-w-0', resolvido && 'opacity-60')}>
                      <div className="flex items-center gap-2 font-medium">
                        {resolvido && <Icone nome="check" className="h-4 w-4 text-emerald-500" />}
                        <span className={cn(resolvido && 'line-through')}>{item.pasta}</span>
                        {item.cpf && (
                          <span className="text-xs font-normal text-zinc-400 tabular-nums">
                            {formatarCpf(item.cpf)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">{item.detalhe}</div>
                      {reprocessar && (
                        <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                          Marcado para reprocessar na próxima leitura de dados.
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {registro ? (
                        <Botao
                          variante="secundario"
                          onClick={() => desfazer(item.chave)}
                          disabled={ocupado}
                        >
                          {ocupado ? 'Salvando…' : 'Desfazer'}
                        </Botao>
                      ) : (
                        <>
                          <Botao
                            variante="secundario"
                            onClick={() => registrar(item.chave, 'reprocessar')}
                            disabled={ocupado}
                          >
                            {ocupado ? 'Salvando…' : 'Reprocessar'}
                          </Botao>
                          <Botao
                            variante="fantasma"
                            onClick={() => registrar(item.chave, 'resolvido')}
                            disabled={ocupado}
                          >
                            Marcar resolvido
                          </Botao>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
