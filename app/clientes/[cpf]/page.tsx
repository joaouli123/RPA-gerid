import { notFound } from 'next/navigation';
import { getClientePorCpf, getConfig } from '@/lib/data';
import { infoDoMotivo } from '@/lib/motivos';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Secao } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { StatusPill } from '@/components/ui/Badge';
import { GrupoFamiliarTabela } from '@/components/dominio/GrupoFamiliarTabela';
import { DocumentosChecklist } from '@/components/dominio/DocumentosChecklist';
import { MotivoBadge } from '@/components/dominio/MotivoBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatarCpf } from '@/lib/format';

export default async function DetalheClientePage({
  params,
}: {
  params: Promise<{ cpf: string }>;
}) {
  const { cpf } = await params;
  const [detalhe, config] = await Promise.all([getClientePorCpf(cpf), getConfig()]);
  if (!detalhe) notFound();

  const emRevisao = detalhe.tipo === 'revisao';
  const cliente = emRevisao ? detalhe.revisao.cliente : detalhe.validado.cliente;
  const grupoFamiliar = emRevisao ? detalhe.revisao.grupoFamiliar : detalhe.validado.grupoFamiliar;
  const arquivos = emRevisao ? detalhe.revisao.arquivos : detalhe.validado.arquivos;
  const motivos = emRevisao ? detalhe.revisao.motivos : [];

  const titulo = cliente?.nome || (emRevisao ? detalhe.revisao.pasta : 'Cliente');
  const cpfExibido = cliente?.cpf ?? (emRevisao ? detalhe.revisao.cpf : undefined);
  const telefone = cliente?.telefone || config.telefonePadrao;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={titulo}
        descricao={cpfExibido ? formatarCpf(cpfExibido) : undefined}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <Botao href="/clientes" variante="secundario">
              Voltar
            </Botao>
            {cpfExibido && <Botao href={`/clientes/${cpf}/editar`}>Editar</Botao>}
          </div>
        }
      />

      {emRevisao ? (
        <StatusPill tom="ambar">Em revisão manual</StatusPill>
      ) : (
        <StatusPill tom="verde">Pronto para o Gerid</StatusPill>
      )}

      {motivos.length > 0 && (
        <Secao titulo="Pendências" descricao="O que precisa ser corrigido antes de protocolar.">
          <div className="space-y-2">
            {motivos.map((m, i) => (
              <Card key={i} className="p-4">
                <MotivoBadge motivo={m} />
                <p className="mt-2 text-sm">{m.detalhe}</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Ação sugerida: {infoDoMotivo(m.codigo).acao}
                </p>
              </Card>
            ))}
          </div>
        </Secao>
      )}

      {cliente ? (
        <Secao titulo="Dados do requerente">
          <Card className="p-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="CPF" valor={cliente.cpf ? formatarCpf(cliente.cpf) : '—'} />
              <Campo rotulo="Cidade" valor={cliente.cidade || '—'} />
              <Campo rotulo="CEP" valor={cliente.cep || '—'} />
              <Campo
                rotulo="Telefone"
                valor={telefone}
                nota={cliente.telefone ? undefined : 'padrão do escritório'}
              />
            </dl>
          </Card>
        </Secao>
      ) : (
        <Secao titulo="Dados do requerente">
          <EmptyState
            titulo="Sem dados na planilha"
            descricao="Esta pasta não tem linha correspondente na aba Clientes, então não há dados do requerente para mostrar."
          />
        </Secao>
      )}

      <Secao
        titulo="Grupo familiar"
        descricao={
          grupoFamiliar
            ? `${grupoFamiliar.integrantes.length} integrante(s) — o Titular é o requerente.`
            : undefined
        }
      >
        {grupoFamiliar ? (
          <GrupoFamiliarTabela grupo={grupoFamiliar} />
        ) : (
          <EmptyState
            titulo="Nenhum integrante encontrado"
            descricao="Não há linhas na aba GrupoFamiliar para o CPF deste requerente."
          />
        )}
      </Secao>

      <Secao
        titulo="Documentos"
        descricao={`4 obrigatórios + 2 facultativos. Limite de ${Math.round(
          config.limiteTamanhoArquivoBytes / (1024 * 1024),
        )} MB por arquivo.`}
      >
        {arquivos ? (
          <DocumentosChecklist
            arquivos={arquivos}
            documentosEsperados={config.documentosEsperados}
            limiteBytes={config.limiteTamanhoArquivoBytes}
          />
        ) : (
          <EmptyState
            titulo="Sem pasta no Drive"
            descricao="Não foi encontrada uma pasta correspondente a este cliente, então não há documentos para listar."
          />
        )}
      </Secao>
    </div>
  );
}

function Campo({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{valor}</dd>
      {nota && <dd className="text-xs text-zinc-400">{nota}</dd>}
    </div>
  );
}

export const dynamic = 'force-dynamic';
