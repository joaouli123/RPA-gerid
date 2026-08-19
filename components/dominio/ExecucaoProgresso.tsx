'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CasoExecucao, ExecucaoAtual } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { Aviso } from '@/components/ui/Aviso';
import { StatusPill, type Tom } from '@/components/ui/Badge';
import { Icone } from '@/components/ui/Icone';
import { DiarioDeBordo } from '@/components/dominio/DiarioDeBordo';
import { ondeTravou } from '@/lib/eventosExecucao';
import { cn } from '@/lib/cn';
import { formatarCpf } from '@/lib/format';

const TOM_CASO: Record<CasoExecucao['status'], Tom> = {
  pendente: 'cinza',
  processando: 'azul',
  revisao: 'ambar',
  sucesso: 'verde',
  erro: 'vermelho',
};

const ROTULO_CASO: Record<CasoExecucao['status'], string> = {
  pendente: 'Na fila',
  processando: 'Processando',
  revisao: 'Revisar e confirmar',
  sucesso: 'Protocolado',
  erro: 'Erro',
};

/**
 * O que cada estado do GERID significa para quem está olhando a tela.
 *
 * `acao` é a parte que faltava: até 19/08/2026 a tela dizia "Autenticação
 * necessária" e parava por aí, deixando o operador adivinhar se devia esperar
 * ou fazer alguma coisa. Estado sem próximo passo é enfeite.
 */
const ESTADO_GERID = {
  aguardando_extensao: {
    rotulo: 'Aguardando extensão',
    tom: 'cinza',
    acao: 'Abra a extensão no Chrome e clique em Iniciar.',
  },
  autenticacao_necessaria: {
    rotulo: 'Autenticação necessária',
    tom: 'ambar',
    acao: 'Conclua o SafeID e o código do autenticador na aba do GERID.',
  },
  autenticado: { rotulo: 'GERID autenticado', tom: 'verde', acao: 'Tudo certo, o robô já pode trabalhar.' },
  processando: { rotulo: 'Preenchendo no GERID', tom: 'azul', acao: 'O robô está trabalhando — não feche a aba.' },
  aguardando_confirmacao: {
    rotulo: 'Confirme no GERID',
    tom: 'ambar',
    acao: 'Revise a tela Confirmar no GERID e conclua o protocolo.',
  },
  revisao: { rotulo: 'Aguardando revisão', tom: 'ambar', acao: 'Um caso precisa de decisão humana.' },
} as const satisfies Record<
  NonNullable<ExecucaoAtual['estadoGerid']>,
  { rotulo: string; tom: Tom; acao: string }
>;

async function mensagemDaResposta(resposta: Response, padrao: string): Promise<string> {
  const dados = (await resposta.json().catch(() => null)) as
    | { erro?: string; mensagem?: string }
    | null;
  return dados?.mensagem || dados?.erro || padrao;
}

/** "há 4 min" — quanto tempo desde o último sinal de vida da extensão. */
function desde(iso: string | undefined, agora: number): string | null {
  if (!iso) return null;
  const quando = new Date(iso).getTime();
  if (Number.isNaN(quando)) return null;
  const segundos = Math.max(0, Math.round((agora - quando) / 1000));
  if (segundos < 60) return `há ${segundos}s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  return `há ${Math.round(minutos / 60)} h`;
}

function Contador({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-2xl font-semibold tabular-nums', cor)}>{valor}</div>
      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{rotulo}</div>
    </div>
  );
}

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
  // Relógio próprio para o "há quanto tempo": sem ele o texto congelaria até a
  // próxima resposta do servidor, e "há 2 min" ficaria mentindo na tela.
  const [agora, setAgora] = useState(() => Date.now());

  const casos: CasoExecucao[] =
    atual?.casos ?? prontos.map((p) => ({ ...p, status: 'pendente' as const }));
  const rodando = atual?.status === 'rodando';
  const concluida = atual?.status === 'concluida';
  const pausada = Boolean(atual?.pausadaEm);
  const estadoGerid = atual?.estadoGerid ? ESTADO_GERID[atual.estadoGerid] : null;
  const eventos = atual?.eventos ?? [];
  const travou = rodando || concluida ? ondeTravou(eventos) : null;
  const ultimoSinal = desde(atual?.ultimoSinalEm, agora);

  const protocolados = casos.filter((c) => c.status === 'sucesso').length;
  const comErro = casos.filter((c) => c.status === 'erro').length;
  const aguardando = casos.filter((c) => c.status === 'revisao').length;
  const naFila = casos.filter((c) => c.status === 'pendente' || c.status === 'processando').length;
  const concluidos = protocolados + comErro + aguardando;
  const progresso = casos.length > 0 ? Math.round((concluidos / casos.length) * 100) : 0;

  const buscarProgresso = useCallback(async (): Promise<ExecucaoAtual | null> => {
    const resposta = await fetch('/api/execucao/atual', { cache: 'no-store' });
    if (!resposta.ok) {
      throw new Error(await mensagemDaResposta(resposta, 'Falha ao consultar o progresso.'));
    }
    const dados = (await resposta.json()) as { execucao: ExecucaoAtual | null };
    const execucao = dados.execucao;
    setAtual(execucao);
    setErro(null);
    return execucao;
  }, []);

  // Enquanto o job roda no servidor, consulta o progresso periodicamente.
  useEffect(() => {
    if (concluida) return;
    // Rodando: 800 ms, para o diário acompanhar o robô quase ao vivo. Parado:
    // 3 s, só para descobrir que a extensão começou por fora.
    const intervalo = rodando ? 800 : 3000;
    const timer = setInterval(() => {
      buscarProgresso().catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : 'Falha ao consultar o progresso.');
      });
    }, intervalo);
    return () => clearInterval(timer);
  }, [rodando, concluida, buscarProgresso]);

  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // Quando termina, atualiza as outras telas (histórico/relatórios).
  useEffect(() => {
    if (concluida) router.refresh();
  }, [concluida, router]);

  function chamar(
    caminho: string,
    padraoErro: string,
    corpo?: unknown,
    aposSucesso?: () => void,
  ) {
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch(caminho, {
          method: corpo === undefined ? 'POST' : 'POST',
          ...(corpo === undefined
            ? {}
            : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }),
        });
        if (!resposta.ok) throw new Error(await mensagemDaResposta(resposta, padraoErro));
        if (aposSucesso) aposSucesso();
        else await buscarProgresso();
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : padraoErro);
      }
    });
  }

  function disparar() {
    if (!geridPronto) return; // trava extra: sem Gerid pronto, não dispara.
    chamar('/api/executar', 'Não foi possível iniciar a execução.');
  }

  function limpar() {
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch('/api/execucao/atual', { method: 'DELETE' });
        if (!resposta.ok) {
          throw new Error(await mensagemDaResposta(resposta, 'Não foi possível limpar a execução.'));
        }
        setAtual(null);
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível limpar a execução.');
      }
    });
  }

  // Pausa/retoma a fila. Vale ENTRE casos: o requerimento que já está na tela
  // do GERID termina, porque abandoná-lo no meio é que criaria estrago.
  function alternarPausa(pausar: boolean) {
    chamar(
      '/api/execucao/pausa',
      pausar ? 'Não foi possível pausar a fila.' : 'Não foi possível retomar a fila.',
      { pausar },
    );
  }

  // Caso parado sem protocolo volta para a fila sozinho, sem "Redefinir" —
  // que apagaria a execução inteira e o resultado dos outros casos junto.
  function reenfileirar(cpf: string) {
    chamar('/api/execucao/reenfileirar', 'Não foi possível devolver o caso para a fila.', { cpf });
  }

  return (
    <div className="space-y-5">
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!geridPronto && (
        <Aviso tom="info" titulo="O preenchimento automático no Gerid ainda está em desenvolvimento.">
          <p>
            Por enquanto o sistema já lê a pasta e a planilha, confere os documentos e separa os
            casos prontos dos que precisam de revisão. O botão de disparar é liberado quando o robô
            estiver pronto para protocolar.
          </p>
        </Aviso>
      )}

      {/* ------------------------------------------------- estado da rodada */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {pausada ? (
                <StatusPill tom="ambar">Fila pausada</StatusPill>
              ) : rodando && estadoGerid ? (
                <StatusPill tom={estadoGerid.tom}>{estadoGerid.rotulo}</StatusPill>
              ) : rodando ? (
                <StatusPill tom="azul">Executando pela extensão</StatusPill>
              ) : concluida ? (
                <StatusPill tom="verde">Rodada concluída</StatusPill>
              ) : (
                <StatusPill tom="cinza">Parado</StatusPill>
              )}
              {rodando && ultimoSinal && (
                <span className="text-xs text-zinc-400">último sinal do robô {ultimoSinal}</span>
              )}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {pausada
                ? 'Nenhum caso novo é pego. O que já estava na tela do GERID termina normalmente.'
                : rodando
                  ? atual?.detalheGerid || estadoGerid?.acao || 'O robô está trabalhando na fila.'
                  : concluida
                    ? 'A fila desta rodada acabou. O relato abaixo continua disponível.'
                    : 'Monte a fila aqui e depois clique em Iniciar na extensão do Chrome.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rodando && (
              <Botao
                variante={pausada ? 'primario' : 'secundario'}
                onClick={() => alternarPausa(!pausada)}
                disabled={iniciando}
              >
                <Icone nome={pausada ? 'execucao' : 'pausa'} className="h-4 w-4" />
                {pausada ? 'Retomar fila' : 'Pausar fila'}
              </Botao>
            )}
            {!rodando && !concluida && casos.length > 0 && (
              <Botao onClick={disparar} disabled={iniciando || !geridPronto}>
                <Icone nome="raio" className="h-4 w-4" />
                {iniciando ? 'Preparando fila...' : 'Preparar fila'}
              </Botao>
            )}
            {atual && (
              <Botao variante="fantasma" onClick={limpar} disabled={iniciando}>
                Limpar execução
              </Botao>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
          <Contador rotulo="Na fila" valor={naFila} cor="text-zinc-900 dark:text-zinc-100" />
          <Contador rotulo="Protocolados" valor={protocolados} cor="text-emerald-600 dark:text-emerald-400" />
          <Contador rotulo="Aguardando você" valor={aguardando} cor="text-amber-600 dark:text-amber-400" />
          <Contador rotulo="Com erro" valor={comErro} cor="text-rose-600 dark:text-rose-400" />
        </div>

        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="mb-2 flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {concluidos} de {casos.length} {casos.length === 1 ? 'caso' : 'casos'}
            </span>
            <span className="tabular-nums">{progresso}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                comErro > 0 ? 'bg-amber-500' : concluida ? 'bg-emerald-500' : 'bg-blue-600',
              )}
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------ onde travou */}
      {travou && (
        <Aviso tom="erro" titulo="Onde o robô parou">
          <p>{travou.mensagem}</p>
          <p className="text-xs opacity-80">
            {travou.passo ? `Passo ${travou.passo} de 10 · ` : ''}
            {new Date(travou.em).toLocaleString('pt-BR')}
          </p>
        </Aviso>
      )}

      {pausada && (
        <Aviso tom="atencao" titulo="Fila pausada">
          <p>
            Nenhum caso novo é pego, e os que ainda não rodaram continuam na fila (nada vira erro).
            Clique em <strong>Retomar fila</strong> e depois em Iniciar na extensão.
          </p>
        </Aviso>
      )}

      {geridPronto && !rodando && !concluida && (
        <Aviso tom="atencao" titulo="A automação roda pela extensão do Chrome">
          <p>
            Monte a fila aqui, abra a extensão e clique em <strong>Iniciar</strong>. Quando for
            pedido, conclua o SafeID/MFA. O robô segue a fila inteira sozinho, um caso atrás do
            outro, e cada passo aparece no relato abaixo.
          </p>
        </Aviso>
      )}

      {/* --------------------------------------------------- diário de bordo */}
      <DiarioDeBordo eventos={eventos} ativo={Boolean(rodando)} />

      {/* ------------------------------------------------------------- casos */}
      <section className="space-y-3">
        <h3 className="font-semibold">Casos desta rodada ({casos.length})</h3>
        {casos.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum cliente pronto para protocolar. Confira a fila de revisão.
            </p>
          </Card>
        ) : (
          <Card padding="none" className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {casos.map((c) => (
              <div key={c.cpf} className="space-y-2 px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.nome}</div>
                    <div className="text-xs tabular-nums text-zinc-400">{formatarCpf(c.cpf)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Deixa explícito que este caso NÃO vai ser preenchido de
                        novo: ele já tem protocolo e voltou só atrás do PDF que
                        faltou. Sem o aviso, ver a pessoa "de volta na fila"
                        faria o operador achar que o robô vai reprotocolar. */}
                    {c.somenteComprovante && (
                      <span className="rounded-md border border-sky-300 px-2 py-1 text-xs font-medium text-sky-700 dark:border-sky-500/40 dark:text-sky-300">
                        Só buscar comprovante
                      </span>
                    )}
                    {c.protocolo && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Protocolo <span className="font-medium tabular-nums">{c.protocolo}</span>
                      </span>
                    )}
                    {/* O PDF que a extensão capturou no GERID, servido pelo
                        próprio painel. Aparece além do arquivo no Drive
                        justamente porque o Drive é a parte que pode falhar. */}
                    {c.comprovante && atual && (
                      <a
                        href={`/api/execucao/comprovante?execucao=${encodeURIComponent(atual.id)}&cpf=${encodeURIComponent(c.cpf)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Arquivado em: ${c.comprovante.referencia}`}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                      >
                        <Icone nome="documento" className="h-3.5 w-3.5" />
                        Comprovante
                      </a>
                    )}
                    <StatusPill tom={TOM_CASO[c.status]}>{ROTULO_CASO[c.status]}</StatusPill>
                    {!c.protocolo && (c.status === 'revisao' || c.status === 'erro') && (
                      <button
                        type="button"
                        onClick={() => reenfileirar(c.cpf)}
                        disabled={iniciando}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Devolver para a fila
                      </button>
                    )}
                  </div>
                </div>
                {/* O motivo do erro ganhou linha própria: espremido no meio da
                    fileira de badges ele virava um fiapo de texto cortado, que
                    é justamente a informação que explica a falha. */}
                {c.motivoErro && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    {c.motivoErro}
                  </p>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Clientes que a leitura do Drive trouxe e que a fila NÃO pegou porque
          já têm protocolo. Precisa estar na tela: sem isso, o operador abre a
          Execução, não encontra a pessoa, e protocola de novo na mão — que é
          exatamente o que a trava existe para impedir. */}
      {atual?.pulados && atual.pulados.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="font-semibold">
              Já protocolados — fora deste lote ({atual.pulados.length})
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              A pasta continua no Drive, então a leitura traz estas pessoas todo dia. O robô não
              refaz o requerimento: cada uma já tem número e comprovante guardados.
            </p>
          </div>
          <Card padding="none" className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {atual.pulados.map((p) => (
              <div
                key={p.cpf}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.nome}</div>
                  <div className="text-xs tabular-nums text-zinc-400">{formatarCpf(p.cpf)}</div>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Protocolo <span className="font-medium tabular-nums">{p.protocolo}</span>
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
