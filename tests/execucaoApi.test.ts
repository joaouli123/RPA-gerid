import { beforeEach, describe, expect, it, vi } from 'vitest';

const getExecucaoAtual = vi.fn();
const limparExecucaoAtual = vi.fn();

vi.mock('@/lib/server/store', () => ({
  getExecucaoAtual,
  limparExecucaoAtual,
}));

const rota = await import('@/app/api/execucao/atual/route');

describe('API estavel de execucao', () => {
  beforeEach(() => {
    getExecucaoAtual.mockReset();
    limparExecucaoAtual.mockReset();
  });

  it('consulta o progresso sem cache', async () => {
    getExecucaoAtual.mockResolvedValue({ id: 'exec-1', status: 'rodando', casos: [] });

    const resposta = await rota.GET();

    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    expect(await resposta.json()).toEqual({
      execucao: { id: 'exec-1', status: 'rodando', casos: [] },
    });
  });

  it('limpa a execucao sem usar Server Action', async () => {
    const resposta = await rota.DELETE();

    expect(limparExecucaoAtual).toHaveBeenCalledOnce();
    expect(await resposta.json()).toEqual({ sucesso: true });
  });
});
