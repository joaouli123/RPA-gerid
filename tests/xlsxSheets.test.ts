import ExcelJS from 'exceljs';
import { describe, it, expect } from 'vitest';
import { XlsxSheetsGateway } from '../src/integrations/sheets/xlsxSheets';
import { InMemoryDriveGateway } from '../src/integrations/drive/inMemoryDrive';
import { parseClientes } from '../src/domain/parsePlanilha';
import { configPadrao } from '../config/default';

/**
 * Gera um .xlsx igual ao do escritório: aba única "Planilha1" e o CPF gravado
 * como NÚMERO — que é justamente como o zero à esquerda se perde.
 */
async function planilhaFake(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planilha1');
  ws.addRow(['Nome', 'CPF', 'CEP', 'Cidade do protocolo', 'Estado civil']);
  ws.addRow(['ANTONIO CARLOS', 11122233344, '40000-000', 'Salvador', 'solteiro']);
  // CPF real do procurador (09876543210) gravado como número -> 9876543210.
  ws.addRow(['FABRICIO DOUGLAS', 9876543210, '74000-000', 'Goiânia', 'casado']);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

async function montarGateway() {
  const conteudo = await planilhaFake();
  const drive = new InMemoryDriveGateway({
    subpastas: [],
    arquivos: {},
    conteudos: { 'planilha-id': conteudo },
  });
  return new XlsxSheetsGateway(drive);
}

describe('XlsxSheetsGateway', () => {
  it('lê a aba do .xlsx como matriz de strings', async () => {
    const sheets = await montarGateway();
    const linhas = await sheets.lerAba('planilha-id', 'Planilha1');

    expect(linhas[0]).toEqual(['Nome', 'CPF', 'CEP', 'Cidade do protocolo', 'Estado civil']);
    expect(linhas[1]?.[0]).toBe('ANTONIO CARLOS');
    expect(linhas[1]?.[3]).toBe('Salvador');
  });

  it('converte número para texto sem notação científica', async () => {
    const sheets = await montarGateway();
    const linhas = await sheets.lerAba('planilha-id', 'Planilha1');
    expect(linhas[1]?.[1]).toBe('11122233344');
    // Aqui o zero à esquerda JÁ tinha se perdido na planilha.
    expect(linhas[2]?.[1]).toBe('9876543210');
  });

  it('cai para a primeira aba quando o nome pedido não existe', async () => {
    const sheets = await montarGateway();
    const linhas = await sheets.lerAba('planilha-id', 'GrupoFamiliar');
    expect(linhas[0]?.[0]).toBe('Nome');
  });

  it('ponta a ponta: o parser recompõe o CPF truncado pela planilha', async () => {
    const sheets = await montarGateway();
    const linhas = await sheets.lerAba('planilha-id', 'Planilha1');
    const clientes = parseClientes(linhas, configPadrao.mapeamentoClientes);

    expect(clientes).toHaveLength(2);
    expect(clientes[0]?.cpf).toBe('11122233344');
    expect(clientes[1]?.cpf).toBe('09876543210'); // zero recomposto
    // Sem coluna "Pasta", a pasta é o Nome.
    expect(clientes[1]?.pasta).toBe('FABRICIO DOUGLAS');
    expect(clientes[1]?.cidade).toBe('Goiânia');
  });
});
