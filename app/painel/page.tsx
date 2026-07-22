import Link from 'next/link';
import { getEstadoFonte, getExecucoes, getResultado } from '@/lib/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Secao } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResumoCards } from '@/components/dominio/ResumoCards';
import { BotaoRecarregar } from '@/components/dominio/BotaoRecarregar';
import { digitosCpf, formatarCpf, formatarData } from '@/lib/format';

export default async function PainelPage() {
  const [resultado, execucoes, fonte] = await Promise.all([
    getResultado(),
    getExecucoes(),
    getEstadoFonte(),
  ]);
  const prontos = resultado.clientesProntos;

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

      {fonte.erro ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Não consegui ler o Google Drive — mostrando dados de exemplo.</strong>
            <div className="mt-1">{fonte.erro}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
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
          descricao="Passaram em todas as validações."
          acao={
            <Link href="/clientes" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              Ver todos
            </Link>
          }
        >
          <Card>
            {prontos.length === 0 ? (
              <div className="p-4">
                <EmptyState titulo="Nenhum caso pronto" />
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {prontos.slice(0, 5).map((c) => (
                  <li key={digitosCpf(c.cliente.cpf)} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <Link
                        href={`/clientes/${digitosCpf(c.cliente.cpf)}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {c.cliente.nome}
                      </Link>
                      <div className="text-xs text-zinc-400 tabular-nums">
                        {formatarCpf(c.cliente.cpf)} · {c.grupoFamiliar.integrantes.length} integrante(s)
                      </div>
                    </div>
                    <StatusPill tom="verde">Pronto</StatusPill>
                  </li>
                ))}
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
          <Card>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {execucoes.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-3">
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
