import Link from 'next/link';
import {
  getEstadoFonte,
  getExecucaoEmAndamento,
  getExecucoes,
  getProtocolosPorCpf,
  getResultado,
} from '@/lib/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Secao } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Aviso } from '@/components/ui/Aviso';
import { ResumoCards } from '@/components/dominio/ResumoCards';
import { BotaoRecarregar } from '@/components/dominio/BotaoRecarregar';
import { digitosCpf, formatarCpf, formatarData } from '@/lib/format';

export default async function PainelPage() {
  const [resultado, execucoes, fonte, protocolados, atual] = await Promise.all([
    getResultado(),
    getExecucoes(),
    getEstadoFonte(),
    getProtocolosPorCpf(),
    getExecucaoEmAndamento(),
  ]);
  const emAndamento = atual?.status === 'rodando' ? atual : null;
  const prontos = resultado.clientesProntos;
  // "Pronto" e "falta protocolar" não são a mesma coisa: a pasta continua no
  // Drive depois do protocolo, então quem já foi volta como pronto todo dia.
  const faltam = prontos.filter((c) => !protocolados.has(digitosCpf(c.cliente.cpf))).length;
  const jaProtocolados = prontos.length - faltam;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Painel"
        descricao="Visão geral do lote atual de protocolos."
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <BotaoRecarregar />
            <Botao href="/execucao">
              <Icone nome="raio" className="h-4 w-4" />
              Executar
            </Botao>
          </div>
        }
      />

      {/* O robô está trabalhando AGORA — e isto precisa aparecer na primeira
          tela, não só em /execucao. Quem abre o painel e vê tudo parado supõe
          que nada está acontecendo, e clica em Executar por cima de uma rodada
          viva. */}
      {emAndamento && (
        <Link
          href="/execucao"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm transition hover:bg-blue-100 dark:border-blue-500/25 dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          </span>
          <span className="min-w-0 flex-1 text-blue-900 dark:text-blue-100">
            <strong>Uma rodada está em andamento.</strong>{' '}
            {emAndamento.casos.filter((c) => c.status === 'sucesso').length} de{' '}
            {emAndamento.casos.length} protocolado(s).
            {emAndamento.detalheGerid ? ` ${emAndamento.detalheGerid}` : ''}
          </span>
          <span className="font-medium text-blue-700 dark:text-blue-300">Acompanhar →</span>
        </Link>
      )}

      {fonte.erro ? (
        <Aviso tom="erro" titulo="Não consegui ler o Google Drive — mostrando dados de exemplo.">
          <p>{fonte.erro}</p>
        </Aviso>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {fonte.reais ? (
            <StatusPill tom="verde">Google conectado</StatusPill>
          ) : (
            <StatusPill tom="ambar">Dados de exemplo</StatusPill>
          )}
          <span className="text-zinc-500 dark:text-zinc-400">
            {fonte.reais
              ? 'Lendo a pasta e a planilha reais do Google Drive.'
              : 'Sem credencial Google no .env — usando o dataset de exemplo.'}
            {fonte.lidoEm && ` Última leitura: ${formatarData(fonte.lidoEm)}.`}
          </span>
        </div>
      )}

      <ResumoCards resumo={resultado.resumo} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao
          titulo="Prontos para o Gerid"
          descricao={
            jaProtocolados > 0
              ? `Passaram em todas as validações. ${faltam} a protocolar · ${jaProtocolados} já protocolado(s).`
              : 'Passaram em todas as validações.'
          }
          acao={
            <Link href="/clientes" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              Ver todos
            </Link>
          }
        >
          <Card padding="none">
            {prontos.length === 0 ? (
              <div className="p-4">
                <EmptyState titulo="Nenhum caso pronto" />
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {prontos.slice(0, 5).map((c) => {
                  const feito = protocolados.get(digitosCpf(c.cliente.cpf));
                  return (
                    <li key={digitosCpf(c.cliente.cpf)} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <Link
                          href={`/clientes/${digitosCpf(c.cliente.cpf)}`}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {c.cliente.nome}
                        </Link>
                        <div className="text-xs text-zinc-400 tabular-nums">
                          {formatarCpf(c.cliente.cpf)} · {c.grupoFamiliar.integrantes.length} integrante(s)
                          {feito && ` · protocolo ${feito.protocolo}`}
                        </div>
                      </div>
                      {/* Quem já tem número NÃO pode aparecer como "Pronto":
                          é o rótulo que faz alguém protocolar duas vezes. */}
                      {feito ? (
                        <StatusPill tom="cinza">Protocolado</StatusPill>
                      ) : (
                        <StatusPill tom="verde">Pronto</StatusPill>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Secao>

        <Secao
          titulo="Últimas execuções"
          descricao="Histórico recente do robô."
          acao={
            <Link href="/relatorios" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              Ver relatórios
            </Link>
          }
        >
          <Card padding="none">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {execucoes.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <div className="font-medium">{formatarData(e.dataISO)}</div>
                    <div className="text-xs text-zinc-400">
                      {e.sucesso} sucesso · {e.erro} erro
                    </div>
                  </div>
                  {e.erro > 0 ? (
                    <StatusPill tom="ambar">{e.erro} com erro</StatusPill>
                  ) : (
                    <StatusPill tom="verde">Tudo ok</StatusPill>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </Secao>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
