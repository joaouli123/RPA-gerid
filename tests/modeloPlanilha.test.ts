import { describe, it, expect } from 'vitest';
import { montarModelo } from '../scripts/modeloPlanilha';
import { XlsxSheetsGateway } from '../src/integrations/sheets/xlsxSheets';
import { InMemoryDriveGateway } from '../src/integrations/drive/inMemoryDrive';
import { parseClientes, parseGrupoFamiliar } from '../src/domain/parsePlanilha';
import { agruparGrupoFamiliar, validarGrupoFamiliar } from '../src/domain/grupoFamiliar';
import { configPadrao } from '../config/default';

/**
 * Garante que o modelo ENTREGUE ao escritório é realmente consumível pelo robô.
 * Sem isto, a gente poderia mandar uma planilha bonita que o parser não lê.
 */
async function gatewayDoModelo() {
  const buffer = await montarModelo().xlsx.writeBuffer();
  const drive = new InMemoryDriveGateway({
    subpastas: [],
    arquivos: {},
    conteudos: { modelo: new Uint8Array(buffer as ArrayBuffer) },
  });
  return new XlsxSheetsGateway(drive);
}

describe('modelo de planilha entregue ao escritório', () => {
  it('a aba Clientes é lida pelo parser', async () => {
    const sheets = await gatewayDoModelo();
    const clientes = parseClientes(
      await sheets.lerAba('modelo', 'Clientes'),
      configPadrao.mapeamentoClientes,
    );

    expect(clientes).toHaveLength(2);
    expect(clientes[0]?.nome).toBe('ANTONIO CARLOS DE SOUZA');
    expect(clientes[0]?.cpf).toBe('11122233344');
    expect(clientes[0]?.cep).toBe('40000-000');
    expect(clientes[0]?.cidade).toBe('Salvador');
    // Sem coluna "Pasta": a pasta do Drive é o Nome.
    expect(clientes[0]?.pasta).toBe('ANTONIO CARLOS DE SOUZA');
  });

  it('a aba GrupoFamiliar produz grupos de tamanho variável e válidos', async () => {
    const sheets = await gatewayDoModelo();
    const clientes = parseClientes(
      await sheets.lerAba('modelo', 'Clientes'),
      configPadrao.mapeamentoClientes,
    );
    const grupos = agruparGrupoFamiliar(
      parseGrupoFamiliar(
        await sheets.lerAba('modelo', 'GrupoFamiliar'),
        configPadrao.mapeamentoGrupoFamiliar,
      ),
    );

    // Antônio mora sozinho -> 1; Maria mora com a mãe -> 2.
    expect(grupos.get('11122233344')?.integrantes).toHaveLength(1);
    expect(grupos.get('52998224725')?.integrantes).toHaveLength(2);

    // E os dois passam nas invariantes do domínio.
    for (const cliente of clientes) {
      const grupo = grupos.get(cliente.cpf);
      expect(validarGrupoFamiliar(grupo, cliente), `grupo de ${cliente.nome}`).toEqual([]);
    }
  });

  it('mantém a coluna CPF como texto (não perde zero à esquerda)', async () => {
    const workbook = montarModelo();
    expect(workbook.getWorksheet('Clientes')?.getColumn(2).numFmt).toBe('@');
    expect(workbook.getWorksheet('GrupoFamiliar')?.getColumn(1).numFmt).toBe('@');
    expect(workbook.getWorksheet('GrupoFamiliar')?.getColumn(4).numFmt).toBe('@');
  });
});
