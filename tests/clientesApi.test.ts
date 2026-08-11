import { describe, expect, it, vi } from 'vitest';

const salvarClienteNaPlanilha = vi.fn();
const excluirClienteDaPlanilha = vi.fn();

vi.mock('@/lib/server/store', () => ({
  salvarClienteNaPlanilha,
  excluirClienteDaPlanilha,
}));

const cadastro = await import('@/app/api/clientes/route');
const exclusao = await import('@/app/api/clientes/[cpf]/route');

describe('API estavel de clientes', () => {
  it('salva o cliente recebido', async () => {
    const entrada = {
      cliente: { nome: 'Pessoa de Teste', cpf: '12345678901', cidade: 'Teste', cep: '12345678' },
      integrantes: [],
    };
    const resposta = await cadastro.POST(new Request('https://rpa.test/api/clientes', {
      method: 'POST',
      body: JSON.stringify(entrada),
    }));

    expect(resposta.status).toBe(200);
    expect(salvarClienteNaPlanilha).toHaveBeenCalledWith(entrada);
  });

  it('exclui pelo CPF da rota', async () => {
    const resposta = await exclusao.DELETE(
      new Request('https://rpa.test/api/clientes/12345678901', { method: 'DELETE' }),
      { params: Promise.resolve({ cpf: '12345678901' }) },
    );

    expect(resposta.status).toBe(200);
    expect(excluirClienteDaPlanilha).toHaveBeenCalledWith('12345678901');
  });
});
