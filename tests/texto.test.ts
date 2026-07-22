import { describe, it, expect } from 'vitest';
import {
  apenasDigitos,
  normalizar,
  normalizarCabecalho,
  padronizarCpf,
  removerAcentos,
} from '../src/domain/texto';

describe('texto', () => {
  it('removerAcentos tira diacríticos', () => {
    expect(removerAcentos('Representação')).toBe('Representacao');
    expect(removerAcentos('Jaboatão dos Guararapes')).toBe('Jaboatao dos Guararapes');
    expect(removerAcentos('Mãe José Órfão')).toBe('Mae Jose Orfao');
  });

  it('normalizar padroniza para minúsculo/sem acento/trim', () => {
    expect(normalizar('  Laudo MÉDICO ')).toBe('laudo medico');
  });

  it('normalizarCabecalho trata _ e espaços como equivalentes', () => {
    expect(normalizarCabecalho('CPF_Requerente')).toBe('cpf requerente');
    expect(normalizarCabecalho('cpf   requerente')).toBe('cpf requerente');
    expect(normalizarCabecalho('CPF do Requerente')).toBe('cpf do requerente');
  });

  it('apenasDigitos extrai só números', () => {
    expect(apenasDigitos('111.444.777-35')).toBe('11144477735');
    expect(apenasDigitos('(81) 99999-0000')).toBe('81999990000');
    expect(apenasDigitos(undefined)).toBe('');
  });
});

describe('padronizarCpf', () => {
  it('recompõe zero à esquerda perdido por planilha numérica', () => {
    // Caso real (aqui com CPF fictício): guardado como número, 09876543210
    // vira 9876543210 e precisa ser recomposto.
    expect(padronizarCpf('9876543210')).toBe('09876543210');
    expect(padronizarCpf('876543210')).toBe('00876543210');
  });

  it('mantém CPF já completo, com ou sem máscara', () => {
    expect(padronizarCpf('09876543210')).toBe('09876543210');
    expect(padronizarCpf('098.765.432-10')).toBe('09876543210');
    expect(padronizarCpf('111.222.333-44')).toBe('11122233344');
  });

  it('não inventa dígito para valor vazio ou claramente inválido', () => {
    expect(padronizarCpf('')).toBe('');
    expect(padronizarCpf(undefined)).toBe('');
    expect(padronizarCpf('123')).toBe('123'); // curto demais para ser CPF truncado
    expect(padronizarCpf('123456789012')).toBe('123456789012'); // longo demais
  });
});
