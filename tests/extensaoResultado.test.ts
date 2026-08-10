import { describe, expect, it } from 'vitest';
import { classificarPreenchimento } from '../extensao-gerid/src/classificarPreenchimento';

describe('extensão Gerid — resultado do preenchimento', () => {
  it('só registra revisão quando a tela Confirmar foi realmente alcançada', () => {
    expect(classificarPreenchimento({
      pronto: true,
      telaAtual: 'Confirmar',
      avisos: [],
    })).toMatchObject({ status: 'revisao' });

    expect(classificarPreenchimento({
      pronto: false,
      telaAtual: 'Selecionar Unidade',
      avisos: ['A unidade da cidade não foi encontrada.'],
    })).toMatchObject({
      status: 'erro',
      erro: expect.stringContaining('Selecionar Unidade'),
    });
  });
});
