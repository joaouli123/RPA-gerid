import { describe, it, expect } from 'vitest';
import { validarDadosCliente } from '../src/domain/validacaoCliente';
import type { Cliente } from '../src/domain/types';
import { CodigoMotivo } from '../src/domain/motivos';

function cliente(over: Partial<Cliente> = {}): Cliente {
  return {
    pasta: 'João Silva',
    cpf: '111.444.777-35',
    nome: 'João',
    cidade: 'Recife',
    cep: '50000-000',
    ...over,
  };
}

describe('validarDadosCliente', () => {
  it('aceita cliente completo', () => {
    expect(validarDadosCliente(cliente())).toEqual([]);
  });

  it('acusa campos obrigatórios faltando', () => {
    const motivos = validarDadosCliente(cliente({ cidade: '', nome: '' }));
    expect(motivos).toHaveLength(1);
    expect(motivos[0]?.codigo).toBe(CodigoMotivo.DADOS_INCOMPLETOS);
    expect(motivos[0]?.contexto?.campos).toEqual(['nome', 'cidade']);
  });

  it('acusa CPF com número de dígitos inválido', () => {
    const motivos = validarDadosCliente(cliente({ cpf: '123' }));
    expect(motivos.some((m) => m.detalhe.includes('CPF inválido'))).toBe(true);
  });
});
