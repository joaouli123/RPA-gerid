'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  excluirClienteDaPlanilha,
  iniciarExecucao,
  limparAcaoRevisao,
  recarregarResultado,
  registrarAcaoRevisao,
  salvarClienteNaPlanilha,
  salvarConfig,
  limparExecucaoAtual,
  getExecucaoAtual,
} from '@/lib/server/store';
import type { EntradaCadastro } from '@/src/domain/validacaoCadastro';
import type { AcaoRevisao, ExecucaoAtual, OverridesConfig } from '@/lib/types';

/**
 * SERVER ACTIONS — o que os botões da UI realmente chamam.
 * Cada uma altera o estado no servidor (persistido) e revalida as telas.
 */

export async function acaoRecarregarDados(): Promise<void> {
  await recarregarResultado();
  revalidatePath('/', 'layout');
}

export async function acaoSalvarConfig(overrides: OverridesConfig): Promise<void> {
  await salvarConfig(overrides);
  revalidatePath('/', 'layout');
}

export async function acaoRegistrarRevisao(chave: string, acao: AcaoRevisao): Promise<void> {
  await registrarAcaoRevisao(chave, acao);
  revalidatePath('/revisao');
  revalidatePath('/painel');
}

export async function acaoDesfazerRevisao(chave: string): Promise<void> {
  await limparAcaoRevisao(chave);
  revalidatePath('/revisao');
  revalidatePath('/painel');
}

export async function acaoIniciarExecucao(): Promise<void> {
  await iniciarExecucao();
  revalidatePath('/execucao');
  revalidatePath('/relatorios');
  revalidatePath('/painel');
}

export async function acaoLimparExecucao(): Promise<void> {
  await limparExecucaoAtual();
  revalidatePath('/execucao');
  revalidatePath('/painel');
}

/** Snapshot leve usado pelo painel para acompanhar a execução da extensão. */
export async function acaoObterExecucaoAtual(): Promise<ExecucaoAtual | null> {
  return getExecucaoAtual();
}

/**
 * Cadastro pelo sistema: grava o cliente + grupo familiar NA PLANILHA do Drive
 * e volta para a lista. Erros de validação sobem para a tela.
 */
export async function acaoSalvarCliente(entrada: EntradaCadastro): Promise<void> {
  await salvarClienteNaPlanilha(entrada);
  revalidatePath('/', 'layout');
  redirect('/clientes');
}

export async function acaoExcluirCliente(cpf: string): Promise<void> {
  await excluirClienteDaPlanilha(cpf);
  revalidatePath('/', 'layout');
  redirect('/clientes');
}
