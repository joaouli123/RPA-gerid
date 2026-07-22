import { describe, it, expect } from 'vitest';
import { parseClientes, parseGrupoFamiliar, lerObjetos } from '../src/domain/parsePlanilha';
import { configPadrao } from '../config/default';

const mapaC = configPadrao.mapeamentoClientes;
const mapaG = configPadrao.mapeamentoGrupoFamiliar;

describe('lerObjetos', () => {
  it('usa a 1ª linha como cabeçalho e descarta linhas vazias', () => {
    const objs = lerObjetos([
      ['Nome', 'CPF'],
      ['João', '111'],
      ['', ''],
      ['Maria', '222'],
    ]);
    expect(objs).toEqual([
      { nome: 'João', cpf: '111' },
      { nome: 'Maria', cpf: '222' },
    ]);
  });
});

describe('parseClientes', () => {
  it('mapeia colunas independente de ordem/caixa e captura extras', () => {
    const rows = [
      ['CPF', 'Nome', 'Pasta', 'Cidade', 'CEP', 'Observacao'],
      ['111.444.777-35', 'João', 'João Silva', 'Recife', '50000-000', 'urgente'],
    ];
    const [c] = parseClientes(rows, mapaC);
    expect(c?.nome).toBe('João');
    expect(c?.pasta).toBe('João Silva');
    // "Cidade" é apelido aceito de "Cidade do protocolo".
    expect(c?.cidade).toBe('Recife');
    expect(c?.cpf).toBe('11144477735');
    expect(c?.telefone).toBeUndefined();
    expect(c?.camposAdicionais).toEqual({ observacao: 'urgente' });
  });

  it('aceita o cabeçalho real "Cidade do protocolo" e usa o Nome como pasta', () => {
    const rows = [
      ['Nome', 'CPF', 'CEP', 'Cidade do protocolo', 'Estado civil'],
      ['ANTONIO CARLOS', '11122233344', '40000-000', 'Salvador', 'solteiro'],
    ];
    const [c] = parseClientes(rows, mapaC);
    expect(c?.cidade).toBe('Salvador');
    // Sem coluna "Pasta", a pasta do Drive é o próprio Nome.
    expect(c?.pasta).toBe('ANTONIO CARLOS');
  });
});

describe('parseGrupoFamiliar', () => {
  it('mapeia integrantes e joga colunas desconhecidas em camposAdicionais', () => {
    const rows = [
      ['cpf_requerente', 'nome', 'parentesco', 'cpf', 'estado_civil', 'Escolaridade'],
      ['111.444.777-35', 'João', 'Titular', '111.444.777-35', 'Solteiro', 'Médio'],
      ['111.444.777-35', 'Rita', 'Mãe', '', 'Viúva', 'Fundamental'],
    ];
    const registros = parseGrupoFamiliar(rows, mapaG);
    expect(registros).toHaveLength(2);
    // CPF sempre normalizado para 11 dígitos.
    expect(registros[0]?.requerenteCpf).toBe('11144477735');
    expect(registros[0]?.integrante.parentesco).toBe('Titular');
    expect(registros[0]?.integrante.camposAdicionais).toEqual({ escolaridade: 'Médio' });
    expect(registros[1]?.integrante.cpf).toBeUndefined();
  });
});
