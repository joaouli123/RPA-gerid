import { describe, it, expect } from 'vitest';
import {
  agruparGrupoFamiliar,
  ehTitular,
  validarGrupoFamiliar,
  type RegistroIntegrante,
} from '../src/domain/grupoFamiliar';
import type { Cliente, GrupoFamiliar, Integrante } from '../src/domain/types';
import { CodigoMotivo } from '../src/domain/motivos';

function integrante(nome: string, parentesco: string, extra: Partial<Integrante> = {}): Integrante {
  return { nome, parentesco, ...extra };
}

function cliente(cpf: string): Cliente {
  return { pasta: 'p', cpf, nome: 'Fulano', cidade: 'Recife', cep: '50000-000' };
}

function grupo(cpf: string, integrantes: Integrante[]): GrupoFamiliar {
  return { requerenteCpf: cpf.replace(/\D/g, ''), integrantes };
}

describe('ehTitular', () => {
  it('reconhece variações de Titular/Requerente', () => {
    expect(ehTitular('Titular')).toBe(true);
    expect(ehTitular('titular')).toBe(true);
    expect(ehTitular('Requerente')).toBe(true);
    expect(ehTitular('O Próprio')).toBe(true);
    expect(ehTitular('Mãe')).toBe(false);
    expect(ehTitular('')).toBe(false);
  });
});

describe('agruparGrupoFamiliar (tamanho variável)', () => {
  it('agrupa integrantes por CPF do requerente, ignorando máscara', () => {
    const registros: RegistroIntegrante[] = [
      { requerenteCpf: '111.444.777-35', integrante: integrante('João', 'Titular') },
      { requerenteCpf: '11144477735', integrante: integrante('Rita', 'Mãe') },
      { requerenteCpf: '529.982.247-25', integrante: integrante('Maria', 'Titular') },
    ];
    const mapa = agruparGrupoFamiliar(registros);
    expect(mapa.get('11144477735')?.integrantes).toHaveLength(2);
    expect(mapa.get('52998224725')?.integrantes).toHaveLength(1);
  });

  it('ignora linhas sem CPF de requerente', () => {
    const mapa = agruparGrupoFamiliar([
      { requerenteCpf: '', integrante: integrante('Sem chave', 'Titular') },
    ]);
    expect(mapa.size).toBe(0);
  });
});

describe('validarGrupoFamiliar', () => {
  it('aceita cliente que mora sozinho (só o Titular)', () => {
    const gf = grupo('111.444.777-35', [
      integrante('João', 'Titular', { cpf: '111.444.777-35' }),
    ]);
    expect(validarGrupoFamiliar(gf, cliente('111.444.777-35'))).toEqual([]);
  });

  it('aceita cliente + mãe (2 integrantes)', () => {
    const gf = grupo('529.982.247-25', [
      integrante('Maria', 'Titular', { cpf: '529.982.247-25' }),
      integrante('Rita', 'Mãe'),
    ]);
    expect(validarGrupoFamiliar(gf, cliente('529.982.247-25'))).toEqual([]);
  });

  it('aceita cliente + mãe + pai + irmão (4 integrantes)', () => {
    const gf = grupo('390.533.447-05', [
      integrante('Pedro', 'Titular', { cpf: '390.533.447-05' }),
      integrante('Joana', 'Mãe'),
      integrante('José', 'Pai'),
      integrante('Paulo', 'Irmão'),
    ]);
    expect(validarGrupoFamiliar(gf, cliente('390.533.447-05'))).toEqual([]);
  });

  it('sinaliza grupo ausente', () => {
    const motivos = validarGrupoFamiliar(undefined, cliente('111.444.777-35'));
    expect(motivos.map((m) => m.codigo)).toEqual([CodigoMotivo.GRUPO_FAMILIAR_AUSENTE]);
  });

  it('sinaliza quando o grupo não inclui o próprio requerente', () => {
    // Só a mãe, sem o requerente (nem CPF do cliente, nem rótulo Titular).
    const gf = grupo('111.444.777-35', [integrante('Rita', 'Mãe')]);
    const motivos = validarGrupoFamiliar(gf, cliente('111.444.777-35'));
    expect(motivos.map((m) => m.codigo)).toContain(CodigoMotivo.GRUPO_FAMILIAR_INVALIDO);
    expect(motivos.some((m) => m.detalhe.includes('requerente'))).toBe(true);
  });

  it('reconhece o requerente pelo CPF, sem depender do rótulo Titular', () => {
    // Linha do requerente só com o CPF (igual ao do cliente), sem parentesco.
    const gf = grupo('111.444.777-35', [
      integrante('', '', { cpf: '111.444.777-35' }),
      integrante('Rita', 'Mãe', { cpf: '390.533.447-05' }),
    ]);
    expect(validarGrupoFamiliar(gf, cliente('111.444.777-35'))).toEqual([]);
  });

  it('sinaliza CPF duplicado no grupo', () => {
    const gf = grupo('111.444.777-35', [
      integrante('João', 'Titular', { cpf: '111.444.777-35' }),
      integrante('Clone', 'Irmão', { cpf: '111.444.777-35' }),
    ]);
    const motivos = validarGrupoFamiliar(gf, cliente('111.444.777-35'));
    expect(motivos.some((m) => m.detalhe.includes('duplicado'))).toBe(true);
  });
});
