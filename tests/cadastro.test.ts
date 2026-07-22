import ExcelJS from 'exceljs';
import { describe, it, expect } from 'vitest';
import { XlsxSheetsGateway } from '../src/integrations/sheets/xlsxSheets';
import { InMemoryDriveGateway } from '../src/integrations/drive/inMemoryDrive';
import { parseClientes, parseGrupoFamiliar } from '../src/domain/parsePlanilha';
import { agruparGrupoFamiliar } from '../src/domain/grupoFamiliar';
import {
  serializarClientes,
  serializarGrupoFamiliar,
  type ClienteComGrupo,
} from '../src/domain/serializarPlanilha';
import { normalizarCadastro, validarCadastro } from '../src/domain/validacaoCadastro';
import { configPadrao } from '../config/default';

const ID = 'planilha';

async function planilhaVazia(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Clientes');
  wb.addWorksheet('GrupoFamiliar');
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function montar() {
  const drive = new InMemoryDriveGateway({
    subpastas: [],
    arquivos: {},
    conteudos: { [ID]: await planilhaVazia() },
  });
  return { drive, sheets: new XlsxSheetsGateway(drive) };
}

/** Grava registros e lê de volta — o ciclo que o cadastro pelo sistema faz. */
async function gravarELer(registros: ClienteComGrupo[]) {
  const { sheets } = await montar();
  await sheets.escreverAbas(ID, {
    Clientes: serializarClientes(registros, configPadrao.mapeamentoClientes),
    GrupoFamiliar: serializarGrupoFamiliar(registros, configPadrao.mapeamentoGrupoFamiliar),
  });

  const clientes = parseClientes(await sheets.lerAba(ID, 'Clientes'), configPadrao.mapeamentoClientes);
  const grupos = agruparGrupoFamiliar(
    parseGrupoFamiliar(await sheets.lerAba(ID, 'GrupoFamiliar'), configPadrao.mapeamentoGrupoFamiliar),
  );
  return { clientes, grupos };
}

describe('validarCadastro', () => {
  const base = {
    cliente: { pasta: '', nome: 'MARIA', cpf: '52998224725', cep: '53000-000', cidade: 'Olinda' },
    integrantes: [{ nome: 'MARIA', parentesco: 'Titular', cpf: '52998224725' }],
  };

  it('aceita cadastro completo', () => {
    expect(validarCadastro(base)).toEqual([]);
  });

  it('exige CEP (é o que localiza a agência)', () => {
    const erros = validarCadastro({ ...base, cliente: { ...base.cliente, cep: '' } });
    expect(erros.some((e) => e.includes('CEP'))).toBe(true);
  });

  it('exige exatamente um Titular', () => {
    const semTitular = validarCadastro({
      ...base,
      integrantes: [{ nome: 'RITA', parentesco: 'Mãe' }],
    });
    expect(semTitular.some((e) => e.includes('Titular'))).toBe(true);

    const doisTitulares = validarCadastro({
      ...base,
      integrantes: [
        { nome: 'MARIA', parentesco: 'Titular' },
        { nome: 'OUTRO', parentesco: 'Titular' },
      ],
    });
    expect(doisTitulares.some((e) => e.includes('apenas um'))).toBe(true);
  });

  it('recusa CPF do Titular diferente do requerente e CPF repetido', () => {
    expect(
      validarCadastro({
        ...base,
        integrantes: [{ nome: 'MARIA', parentesco: 'Titular', cpf: '11122233396' }],
      }).some((e) => e.includes('igual ao CPF do requerente')),
    ).toBe(true);

    expect(
      validarCadastro({
        ...base,
        integrantes: [
          { nome: 'MARIA', parentesco: 'Titular', cpf: '52998224725' },
          { nome: 'CLONE', parentesco: 'Irmão(ã)', cpf: '52998224725' },
        ],
      }).some((e) => e.includes('repetido')),
    ).toBe(true);
  });
});

describe('normalizarCadastro', () => {
  it('recompõe zero à esquerda e usa o nome como pasta', () => {
    const { cliente } = normalizarCadastro({
      cliente: { pasta: '', nome: '  FABRICIO  ', cpf: '9876543210', cep: '74000-000', cidade: 'Goiânia' },
      integrantes: [{ nome: 'FABRICIO', parentesco: 'Titular', cpf: '' }],
    });
    expect(cliente.cpf).toBe('09876543210');
    expect(cliente.nome).toBe('FABRICIO');
    expect(cliente.pasta).toBe('FABRICIO');
  });

  it('o Titular sem CPF herda o CPF do requerente', () => {
    const { integrantes } = normalizarCadastro({
      cliente: { pasta: '', nome: 'MARIA', cpf: '52998224725', cep: '5', cidade: 'Olinda' },
      integrantes: [{ nome: 'MARIA', parentesco: 'Titular', cpf: '' }],
    });
    expect(integrantes[0]?.cpf).toBe('52998224725');
  });
});

describe('gravar na planilha e ler de volta (ciclo do cadastro)', () => {
  it('preserva os dados e o grupo familiar de tamanho variável', async () => {
    const registros: ClienteComGrupo[] = [
      {
        cliente: { pasta: 'ANTONIO', nome: 'ANTONIO', cpf: '11122233344', cep: '40000-000', cidade: 'Salvador' },
        grupoFamiliar: {
          requerenteCpf: '11122233344',
          integrantes: [{ nome: 'ANTONIO', parentesco: 'Titular', cpf: '11122233344' }],
        },
      },
      {
        cliente: { pasta: 'MARIA', nome: 'MARIA', cpf: '52998224725', cep: '53000-000', cidade: 'Olinda', telefone: '(81) 99999-0000' },
        grupoFamiliar: {
          requerenteCpf: '52998224725',
          integrantes: [
            { nome: 'MARIA', parentesco: 'Titular', cpf: '52998224725' },
            { nome: 'RITA', parentesco: 'Mãe', renda: '1412' },
          ],
        },
      },
    ];

    const { clientes, grupos } = await gravarELer(registros);

    expect(clientes).toHaveLength(2);
    expect(clientes.find((c) => c.nome === 'MARIA')?.cep).toBe('53000-000');
    expect(clientes.find((c) => c.nome === 'MARIA')?.telefone).toBe('(81) 99999-0000');

    // Tamanho variável preservado: 1 e 2 integrantes.
    expect(grupos.get('11122233344')?.integrantes).toHaveLength(1);
    expect(grupos.get('52998224725')?.integrantes).toHaveLength(2);
    expect(grupos.get('52998224725')?.integrantes[1]?.parentesco).toBe('Mãe');
  });

  it('mantém o zero à esquerda do CPF após gravar', async () => {
    const { clientes, grupos } = await gravarELer([
      {
        cliente: { pasta: 'FABRICIO', nome: 'FABRICIO', cpf: '09876543210', cep: '74000-000', cidade: 'Goiânia' },
        grupoFamiliar: {
          requerenteCpf: '09876543210',
          integrantes: [{ nome: 'FABRICIO', parentesco: 'Titular', cpf: '09876543210' }],
        },
      },
    ]);

    expect(clientes[0]?.cpf).toBe('09876543210');
    expect(grupos.get('09876543210')?.integrantes).toHaveLength(1);
  });

  it('regravar substitui as linhas antigas (não duplica)', async () => {
    const { sheets } = await montar();
    const um: ClienteComGrupo[] = [
      {
        cliente: { pasta: 'A', nome: 'A', cpf: '11122233344', cep: '1', cidade: 'X' },
        grupoFamiliar: { requerenteCpf: '11122233344', integrantes: [{ nome: 'A', parentesco: 'Titular' }] },
      },
    ];

    await sheets.escreverAbas(ID, {
      Clientes: serializarClientes([...um, ...um], configPadrao.mapeamentoClientes),
      GrupoFamiliar: serializarGrupoFamiliar(um, configPadrao.mapeamentoGrupoFamiliar),
    });
    await sheets.escreverAbas(ID, {
      Clientes: serializarClientes(um, configPadrao.mapeamentoClientes),
      GrupoFamiliar: serializarGrupoFamiliar(um, configPadrao.mapeamentoGrupoFamiliar),
    });

    const clientes = parseClientes(await sheets.lerAba(ID, 'Clientes'), configPadrao.mapeamentoClientes);
    expect(clientes).toHaveLength(1);
  });
});
