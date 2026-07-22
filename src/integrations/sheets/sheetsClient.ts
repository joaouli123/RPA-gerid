import { sheets as criarSheetsApi, type sheets_v4 } from '@googleapis/sheets';
import type { GoogleAuth } from 'google-auth-library';
import type { SheetsGateway } from './sheetsGateway';

/**
 * Adapter REAL da planilha (Google Sheets API v4). Não é exercitado nos testes
 * (que usam InMemorySheetsGateway).
 */
export class SheetsClient implements SheetsGateway {
  private readonly api: sheets_v4.Sheets;

  constructor(auth: GoogleAuth) {
    this.api = criarSheetsApi({ version: 'v4', auth: auth as never });
  }

  async lerAba(spreadsheetId: string, aba: string): Promise<string[][]> {
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId,
      range: aba,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const valores = res.data.values ?? [];
    return valores.map((linha) => linha.map((celula) => (celula == null ? '' : String(celula))));
  }
}
