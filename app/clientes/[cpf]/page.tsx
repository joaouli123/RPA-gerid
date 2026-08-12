import { notFound } from 'next/navigation';
import { getClientePorCpf, getConfig, getProtocoloDoCliente } from '@/lib/data';
import { infoDoMotivo } from '@/lib/motivos';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Secao } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { StatusPill } from '@/components/ui/Badge';
import { GrupoFamiliarTabela } from '@/components/dominio/GrupoFamiliarTabela';
import { DocumentosChecklist } from '@/components/dominio/DocumentosChecklist';
import { MotivoBadge } from '@/components/dominio/MotivoBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icone } from '@/components/ui/Icone';
import { formatarBytes, formatarCpf, formatarData } from '@/lib/format';
import type { ProtocoloDoCliente } from '@/lib/types';

export default async function DetalheClientePage({
  params,
}: {
  params: Promise<{ cpf: string }>;
}) {
  const { cpf } = await params;
  const [detalhe, config, protocolo] = await Promise.all([
    getClientePorCpf(cpf),
    getConfig(),
    getProtocoloDoCliente(cpf),
  ]);
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

      {/* "Pronto para o Gerid" em quem JÁ foi protocolado é convite a
          protocolar de novo: a pasta continua no Drive depois do protocolo, e a
          leitura devolve a pessoa como pronta para sempre. O número manda. */}
      {protocolo ? (
        <StatusPill tom="azul">Protocolado</StatusPill>
      ) : emRevisao ? (
        <StatusPill tom="ambar">Em revisão manual</StatusPill>
      ) : (
        <StatusPill tom="verde">Pronto para o Gerid</StatusPill>
      )}

      <Secao
        titulo="Protocolo e comprovante"
        descricao="O PDF que o robô baixou no GERID, guardado aqui e na pasta do cliente no Drive."
      >
        <ProtocoloDoClienteCard protocolo={protocolo} />
      </Secao>

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

/**
 * Protocolo + comprovante na ficha do cliente.
 *
 * Cada estado tem um texto próprio de propósito: "sem protocolo", "protocolado
 * sem PDF" e "PDF registrado mas sumido do disco" são situações diferentes, e
 * juntar as três num "comprovante indisponível" mandaria o operador procurar no
 * lugar errado.
 */
function ProtocoloDoClienteCard({ protocolo }: { protocolo: ProtocoloDoCliente | null }) {
  if (!protocolo) {
    return (
      <EmptyState
        titulo="Ainda não protocolado"
        descricao="O comprovante aparece aqui assim que o robô protocolar no GERID e baixar o PDF."
      />
    );
  }

  const comprovante = protocolo.comprovante;
  const base = `/api/execucao/comprovante?execucao=${encodeURIComponent(
    protocolo.idExecucaoDoComprovante ?? '',
  )}&cpf=${encodeURIComponent(protocolo.cpf)}`;

  return (
    <Card className="p-4">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Protocolo" valor={protocolo.protocolo} />
        <Campo rotulo="Protocolado em" valor={formatarData(protocolo.em)} />
        <Campo
          rotulo="Arquivo"
          valor={comprovante ? formatarBytes(comprovante.tamanhoBytes) : '—'}
          nota={comprovante?.nome}
        />
      </dl>

      {comprovante && protocolo.arquivoDisponivel ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* <a> puro, não <Link>: rota de API não é página, e o download tem
              que sair do servidor em vez de virar navegação do cliente. */}
          <a
            href={base}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Icone nome="documento" className="h-4 w-4" />
            Abrir comprovante
          </a>
          <a
            href={`${base}&baixar=1`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Icone nome="baixar" className="h-4 w-4" />
            Baixar PDF
          </a>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Original em {comprovante.destino === 'drive' ? 'Drive do cliente' : 'disco do servidor'}
            : {comprovante.referencia}
          </span>
        </div>
      ) : comprovante ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
          O comprovante foi baixado em {formatarData(comprovante.em)} e arquivado em{' '}
          {comprovante.referencia}, mas a cópia do painel não está mais no disco — provavelmente um
          deploy sem volume persistente. O requerimento está protocolado; o PDF você pega no Drive.
        </p>
      ) : (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
          Protocolado, mas o PDF não foi capturado. O cliente volta à fila só para buscar o
          comprovante — o robô não abre o formulário de novo, então não há risco de segundo pedido.
        </p>
      )}
    </Card>
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
