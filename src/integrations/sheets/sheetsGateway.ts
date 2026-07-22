/**
 * PORT — contrato de acesso à planilha de que o Módulo 1 depende.
 * Devolve a matriz crua de células (a 1ª linha é o cabeçalho); o parsing/
 * mapeamento fica no domínio (parsePlanilha.ts).
 */
export interface SheetsGateway {
  lerAba(spreadsheetId: string, aba: string): Promise<string[][]>;
}

/**
 * Planilha que também aceita ESCRITA (usada pelo cadastro pelo sistema).
 * Separado de SheetsGateway porque a leitura sozinha basta para o Módulo 1.
 */
export interface SheetsGatewayGravavel extends SheetsGateway {
  /**
   * Regrava as abas informadas (cada uma com cabeçalho + linhas) e sobe o
   * arquivo de volta. Abas não citadas ficam intactas.
   */
  escreverAbas(spreadsheetId: string, abas: Record<string, string[][]>): Promise<void>;
}
