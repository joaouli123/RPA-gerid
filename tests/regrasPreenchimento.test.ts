import { describe, expect, it } from 'vitest';
import type { GrupoFamiliar } from '../src/domain/types';
import {
  RESPOSTAS_FIXAS,
  formaDeConvivio,
  estadoCivilGerid,
  mapearParentesco,
  escolherUnidadePorCidade,
  planoGrupoFamiliar,
  slotGeridDoDocumento,
  ESTADO_CIVIL_PADRAO,
} from '../src/modulo2/regrasPreenchimento';
import { configPadrao } from '../config/default';

/**
 * Estas regras decidem o que o robô digita no GERID em nome de uma pessoa com
 * deficiência. Um erro aqui vira dado errado num requerimento real — por isso
 * cada decisão do Fabrício (23/07/2026) está travada por um teste.
 */

describe('respostas fixas (confirmadas pelo escritório)', () => {
  it('comprometimento de renda e proteção especial são "Não"', () => {
    expect(RESPOSTAS_FIXAS.comprometimentoDeRenda).toBe('Não');
    expect(RESPOSTAS_FIXAS.protecaoEspecialSuas).toBe('Não');
  });

  it('procurador é "Sim" e representante legal é "Não"', () => {
    expect(RESPOSTAS_FIXAS.procurador).toBe('Sim');
    expect(RESPOSTAS_FIXAS.representanteLegal).toBe('Não');
  });
});

describe('forma de convívio (deriva do grupo familiar)', () => {
  const grupo = (n: number): GrupoFamiliar => ({
    requerenteCpf: '11122233344',
    integrantes: Array.from({ length: n }, (_, i) => ({
      nome: `P${i}`,
      parentesco: i === 0 ? 'Titular' : 'Mãe',
    })),
  });

  it('mora sozinho quando só há o Titular', () => {
    expect(formaDeConvivio(grupo(1))).toBe('Sozinho');
  });

  it('mora com a família quando há mais integrantes', () => {
    expect(formaDeConvivio(grupo(3))).toBe('Com pessoas da família');
  });
});

describe('estado civil da planilha', () => {
  it('vazio vira Solteiro', () => {
    expect(estadoCivilGerid(undefined)).toBe(ESTADO_CIVIL_PADRAO);
    expect(estadoCivilGerid('')).toBe('Solteiro');
  });

  it('preserva cada opção conhecida do integrante', () => {
    expect(estadoCivilGerid('casado')).toBe('Casado');
    expect(estadoCivilGerid('viúvo')).toBe('Viúvo');
    expect(estadoCivilGerid('divorciado')).toBe('Divorciado');
    expect(estadoCivilGerid('separado')).toBe('Separado');
    expect(estadoCivilGerid('união estável')).toBe('União Estável');
    expect(estadoCivilGerid('amasiado')).toBe('União Estável');
  });

  it('valor desconhecido cai no padrão seguro (Solteiro)', () => {
    expect(estadoCivilGerid('não informado')).toBe('Solteiro');
  });
});

describe('parentesco (planilha -> grupos do GERID)', () => {
  it('Titular vira "Requerente"', () => {
    expect(mapearParentesco('Titular').grupo).toBe('Requerente');
  });

  it('mãe e pai caem no grupo confirmado', () => {
    expect(mapearParentesco('Mãe')).toEqual({ grupo: 'Pai / Mãe / Padrasto / Madrasta', confirmado: true });
    expect(mapearParentesco('pai').grupo).toBe('Pai / Mãe / Padrasto / Madrasta');
  });

  it('irmão/irmã caem no grupo confirmado', () => {
    expect(mapearParentesco('Irmão(ã)')).toEqual({ grupo: 'Irmão / Irmã', confirmado: true });
  });

  it('filho usa a opção oficial; cônjuge e avô ficam marcados para conferir', () => {
    expect(mapearParentesco('cônjuge').confirmado).toBe(false);
    expect(mapearParentesco('filho')).toEqual({ grupo: 'Filho(a)', confirmado: true });
    expect(mapearParentesco('avó').confirmado).toBe(false);
  });

  it('parentesco desconhecido usa Outros e fica marcado para conferência', () => {
    expect(mapearParentesco('primo em segundo grau')).toEqual({ grupo: 'Outros', confirmado: false });
  });
});

describe('escolher unidade pela cidade do cliente', () => {
  const opcoes = [
    { nome: 'AGÊNCIA SALVADOR', cidade: 'Salvador' },
    { nome: 'AGÊNCIA CASTRO ALVES', cidade: 'Castro Alves' },
  ];

  it('escolhe a da cidade do cliente mesmo que não seja a primeira', () => {
    expect(escolherUnidadePorCidade(opcoes, 'Castro Alves')?.nome).toBe('AGÊNCIA CASTRO ALVES');
  });

  it('ignora acento e caixa', () => {
    expect(escolherUnidadePorCidade(opcoes, 'castro alves')?.nome).toBe('AGÊNCIA CASTRO ALVES');
  });

  it('casa pelo nome da unidade quando a opção não traz cidade', () => {
    const semCidade = [{ nome: 'CASTRO ALVES-BA' }, { nome: 'SALVADOR' }];
    expect(escolherUnidadePorCidade(semCidade, 'Castro Alves')?.nome).toBe('CASTRO ALVES-BA');
  });

  it('nenhuma cidade bate -> null (não escolhe cidade errada)', () => {
    expect(escolherUnidadePorCidade(opcoes, 'Goiânia')).toBeNull();
  });
});

describe('documento -> slot nomeado do GERID', () => {
  it('cada tipo obrigatório tem um slot definido', () => {
    expect(slotGeridDoDocumento('TERMO_REPRESENTACAO')).toContain('Termo de representação');
    expect(slotGeridDoDocumento('DOCUMENTOS_PESSOAIS')).toContain('identificação do interessado');
    expect(slotGeridDoDocumento('OAB')).toContain('procurador');
    expect(slotGeridDoDocumento('CADASTRO_UNICO')).toContain('membros do grupo familiar');
  });

  it('todo tipo esperado na config tem um slot (nada fica sem destino)', () => {
    for (const doc of configPadrao.documentosEsperados) {
      expect(slotGeridDoDocumento(doc.tipo), `slot para ${doc.tipo}`).toBeTruthy();
    }
  });

  it('tipo desconhecido não inventa slot', () => {
    expect(slotGeridDoDocumento('QUALQUER_OUTRO')).toBeNull();
  });
});

describe('plano do grupo familiar (casado por CPF)', () => {
  it('monta parentesco + estado civil por integrante e marca o titular', () => {
    const plano = planoGrupoFamiliar([
      { nome: 'ANTONIO', parentesco: 'Titular', cpf: '111', estadoCivil: '' },
      { nome: 'RITA', parentesco: 'Mãe', cpf: '222', estadoCivil: 'viúvo' },
      { nome: 'LUCAS', parentesco: 'Irmão', cpf: '333' },
    ]);

    expect(plano[0]).toMatchObject({ cpf: '111', titular: true, estadoCivil: 'Solteiro' });
    expect(plano[1]).toMatchObject({ cpf: '222', titular: false, estadoCivil: 'Viúvo' });
    expect(plano[1]?.parentesco.grupo).toBe('Pai / Mãe / Padrasto / Madrasta');
    expect(plano[2]).toMatchObject({ cpf: '333', estadoCivil: 'Solteiro' });
    expect(plano[2]?.parentesco.grupo).toBe('Irmão / Irmã');
  });
});
