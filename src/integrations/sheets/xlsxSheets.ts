import ExcelJS from 'exceljs';
import type { DriveGateway } from '../drive/driveGateway';
import type { SheetsGatewayGravavel } from './sheetsGateway';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Colunas que guardam CPF e precisam ficar como TEXTO (senão perdem o zero à esquerda). */
const COLUNAS_TEXTO = /cpf/i;

/**
 * Lê a planilha do escritório, que é um **.xlsx comum no Drive** e não uma
 * planilha nativa do Google — por isso a Sheets API não serve. Aqui o arquivo
 * é baixado pela Drive API e parseado com exceljs.
 *
 * O workbook é baixado UMA vez por execução e reaproveitado entre as abas.
 */
export class XlsxSheetsGateway implements SheetsGatewayGravavel {
  private cache: { id: string; workbook: ExcelJS.Workbook } | null = null;

  constructor(private readonly drive: DriveGateway) {}

  /**
   * Regrava as abas informadas e sobe o .xlsx de volta ao Drive.
   * As colunas de CPF são forçadas a TEXTO para não perder zero à esquerda.
   */
  async escreverAbas(spreadsheetId: string, abas: Record<string, string[][]>): Promise<void> {
    const workbook = await this.carregarWorkbook(spreadsheetId);

    for (const [nomeAba, linhas] of Object.entries(abas)) {
      // Recria a aba do zero para não sobrar linha antiga.
      const existente = workbook.getWorksheet(nomeAba);
      if (existente) workbook.removeWorksheet(existente.id);
      const aba = workbook.addWorksheet(nomeAba);

      const cabecalho = linhas[0] ?? [];
      for (const linha of linhas) aba.addRow(linha);

      if (cabecalho.length > 0) {
        aba.getRow(1).font = { bold: true };
        aba.views = [{ state: 'frozen', ySplit: 1 }];
        cabecalho.forEach((titulo, i) => {
          const coluna = aba.getColumn(i + 1);
          if (COLUNAS_TEXTO.test(titulo)) coluna.numFmt = '@';
          const larguras = linhas.map((l) => (l[i] ?? '').length);
          coluna.width = Math.min(Math.max(...larguras, titulo.length) + 2, 42);
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    await this.drive.atualizarArquivo(spreadsheetId, new Uint8Array(buffer as ArrayBuffer), MIME_XLSX);

    // Invalida o cache: o arquivo mudou.
    this.cache = null;
  }

  async lerAba(spreadsheetId: string, aba: string): Promise<string[][]> {
    const workbook = await this.carregarWorkbook(spreadsheetId);

    // Se a aba pedida não existir, cai para a primeira (a planilha real tem
    // uma aba só, chamada "Planilha1").
    const planilha = workbook.getWorksheet(aba) ?? workbook.worksheets[0];
    if (!planilha) return [];

    const totalColunas = planilha.columnCount;
    const linhas: string[][] = [];

    planilha.eachRow({ includeEmpty: true }, (linha) => {
      const celulas: string[] = [];
      for (let coluna = 1; coluna <= totalColunas; coluna++) {
        celulas.push(valorParaTexto(linha.getCell(coluna).value));
      }
      linhas.push(celulas);
    });

    return linhas;
  }

  private async carregarWorkbook(arquivoId: string): Promise<ExcelJS.Workbook> {
    if (this.cache?.id === arquivoId) return this.cache.workbook;

    const bytes = await this.drive.baixarArquivo(arquivoId);
    const workbook = new ExcelJS.Workbook();

    // Buffer.from(...) sem cópia extra. O cast existe porque o exceljs declara
    // seu próprio tipo Buffer, incompatível com o Buffer genérico do
    // @types/node 20+ — em runtime é o mesmo objeto.
    const dados = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    type EntradaLoad = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(dados as unknown as EntradaLoad);

    this.cache = { id: arquivoId, workbook };
    return workbook;
  }
}

/**
 * Converte o valor de uma célula em texto.
 * Importante: números viram string sem notação científica — é o caso do CPF,
 * que a planilha guarda como número (e por isso perde o zero à esquerda; quem
 * recompõe é `padronizarCpf`, no parser de domínio).
 */
function valorParaTexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';

  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);

  if (typeof valor === 'object') {
    // Fórmula: usa o resultado calculado.
    if ('result' in valor && valor.result !== undefined) {
      return valorParaTexto(valor.result as ExcelJS.CellValue);
    }
    // Texto rico.
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((p) => p.text).join('').trim();
    }
    // Hiperlink.
    if ('text' in valor && typeof valor.text === 'string') return valor.text.trim();
    if ('error' in valor) return '';
  }

  return String(valor).trim();
}
