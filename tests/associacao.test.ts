import { describe, it, expect } from 'vitest';
import { associar } from '../src/domain/associacao';
import type { Cliente, PastaInfo } from '../src/domain/types';

function cliente(pasta: string, cpf = '111.444.777-35'): Cliente {
  return { pasta, cpf, nome: 'Fulano', cidade: 'Recife', cep: '50000-000' };
}

const pastas: PastaInfo[] = [
  { id: 'p1', nome: 'João Silva' },
  { id: 'p2', nome: 'Maria Souza' },
  { id: 'p3', nome: 'Cliente Fantasma' },
];

describe('associar', () => {
  it('casa pasta<->cliente pelo nome (tolerante a acento/caixa/espaços)', () => {
    const { pares } = associar(pastas, [
      cliente('joao silva'), // sem acento, minúsculo
      cliente('Maria  Souza'), // espaço duplo
    ]);
    expect(pares.map((p) => p.pasta.id).sort()).toEqual(['p1', 'p2']);
  });

  it('reporta pasta sem cliente', () => {
    const { pastasSemCliente } = associar(pastas, [cliente('João Silva')]);
    expect(pastasSemCliente.map((p) => p.nome)).toContain('Cliente Fantasma');
  });

  it('reporta cliente sem pasta', () => {
    const { clientesSemPasta } = associar(pastas, [
      cliente('João Silva'),
      cliente('Carlos Extra'),
    ]);
    expect(clientesSemPasta.map((c) => c.pasta)).toEqual(['Carlos Extra']);
  });
});
