import type { SheetsGateway } from './sheetsGateway';

/**
 * Adapter em memória da planilha (indexado por nome de aba).
 * Compartilhado por testes e pelo dry-run.
 */
export class InMemorySheetsGateway implements SheetsGateway {
  constructor(private readonly abas: Record<string, string[][]>) {}

  async lerAba(_spreadsheetId: string, aba: string): Promise<string[][]> {
    return this.abas[aba] ?? [];
  }
}
