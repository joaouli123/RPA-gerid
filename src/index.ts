import { carregarConfig } from '../config/default';
import { criarAuth } from './integrations/google/auth';
import { DriveClient } from './integrations/drive/driveClient';
import { SheetsClient } from './integrations/sheets/sheetsClient';
import { lerDados } from './modulo1/lerDados';
import { imprimirResultado } from './relatorio/imprimir';

/**
 * Entry do run REAL do Módulo 1 (precisa de credenciais Google).
 * Para rodar sem credenciais contra dados de exemplo, use `pnpm demo`.
 */
async function main(): Promise<void> {
  const config = carregarConfig();

  if (!config.pastaRaizId || !config.spreadsheetId) {
    console.error(
      'Faltam RPA_PASTA_RAIZ_ID e/ou RPA_SPREADSHEET_ID. Configure o .env (ver .env.example).\n' +
        'Para um teste sem credenciais, rode: pnpm demo',
    );
    process.exitCode = 1;
    return;
  }

  const auth = criarAuth();
  const drive = new DriveClient(auth);
  const sheets = new SheetsClient(auth);

  const resultado = await lerDados(config, drive, sheets);
  imprimirResultado(resultado);
}

main().catch((err) => {
  console.error('Falha ao executar o Módulo 1:', err);
  process.exitCode = 1;
});
