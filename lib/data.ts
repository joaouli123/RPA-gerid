import type { AppConfig } from '@/config/default';
import type { ClienteRevisao, ClienteValidado, ResultadoLeitura } from '@/src/domain/types';
import type {
  Execucao,
  ExecucaoAtual,
  ProtocoloDoCliente,
  ProtocoloRegistrado,
  RegistroAcaoRevisao,
} from '@/lib/types';
import { digitosCpf } from '@/lib/format';
import {
  getAcoesRevisao,
  getConfig as getConfigStore,
  getErroFonte,
  getExecucao as getExecucaoStore,
  getExecucaoAtual,
  getExecucoes as getExecucoesStore,
  getLidoEm,
  getResultado as getResultadoStore,
  protocoloDoCpf as protocoloDoCpfStore,
  protocolosPorCpf as protocolosPorCpfStore,
  usandoDadosReais,
} from '@/lib/server/store';

/**
 * CAMADA DE ACESSO A DADOS (server-side).
 *
 * Os Server Components chamam estas funções, que leem o estado do servidor
 * (`lib/server/store.ts`). O store roda o Módulo 1 de verdade — contra o Google
 * real se houver credencial no .env, senão contra o dataset de exemplo.
 *
 * NÃO importe este módulo de um Client Component (ele usa node:fs).
 * As mutações ficam em `lib/server/actions.ts`.
 */

export type DetalheCliente =
  | { tipo: 'pronto'; validado: ClienteValidado }
  | { tipo: 'revisao'; revisao: ClienteRevisao };

/**
 * Protocolos já emitidos, por CPF (só dígitos).
 *
 * A tela precisa disso porque "pronto para o Gerid" e "falta protocolar" não
 * são a mesma coisa: a pasta do cliente continua no Drive depois do protocolo,
 * então a leitura devolve a mesma pessoa como "pronta" para sempre. Mostrar
 * todo mundo como pronto faria alguém protocolar de novo na mão.
 */
export async function getProtocolosPorCpf(): Promise<Map<string, ProtocoloRegistrado>> {
  return protocolosPorCpfStore();
}

/**
 * O protocolo e o comprovante DESTE cliente, para a tela dele.
 *
 * A Execução mostra o comprovante do lote que está rodando; passado o dia, o
 * lote sai da tela e o PDF vira caça ao tesouro no histórico. Quem liga
 * perguntando "saiu o meu?" é atendido pelo CPF, então é na ficha do cliente
 * que o arquivo precisa estar.
 */
export async function getProtocoloDoCliente(cpf: string): Promise<ProtocoloDoCliente | null> {
  return protocoloDoCpfStore(cpf);
}

export async function getResultado(): Promise<ResultadoLeitura> {
  return getResultadoStore();
}

export async function getResumo(): Promise<ResultadoLeitura['resumo']> {
  return (await getResultadoStore()).resumo;
}

export async function getClientesProntos(): Promise<ClienteValidado[]> {
  return (await getResultadoStore()).clientesProntos;
}

export async function getClientesRevisao(): Promise<ClienteRevisao[]> {
  return (await getResultadoStore()).clientesParaRevisao;
}

export async function getClientePorCpf(cpf: string): Promise<DetalheCliente | null> {
  const alvo = digitosCpf(cpf);
  const resultado = await getResultadoStore();

  const pronto = resultado.clientesProntos.find((c) => digitosCpf(c.cliente.cpf) === alvo);
  if (pronto) return { tipo: 'pronto', validado: pronto };

  const revisao = resultado.clientesParaRevisao.find((c) => c.cpf && digitosCpf(c.cpf) === alvo);
  if (revisao) return { tipo: 'revisao', revisao };

  return null;
}

export async function getExecucoes(): Promise<Execucao[]> {
  return getExecucoesStore();
}

export async function getExecucao(id: string): Promise<Execucao | null> {
  return getExecucaoStore(id);
}

export async function getConfig(): Promise<AppConfig> {
  return getConfigStore();
}

export async function getEstadoFonte(): Promise<{
  reais: boolean;
  lidoEm: string | null;
  erro: string | null;
}> {
  // Força a leitura antes de reportar, senão o erro ainda não existe.
  await getResultadoStore();
  return { reais: usandoDadosReais(), lidoEm: getLidoEm(), erro: getErroFonte() };
}

export async function getAcoes(): Promise<Record<string, RegistroAcaoRevisao>> {
  return getAcoesRevisao();
}

export async function getExecucaoEmAndamento(): Promise<ExecucaoAtual | null> {
  return getExecucaoAtual();
}

export type { ExecucaoAtual, RegistroAcaoRevisao };
