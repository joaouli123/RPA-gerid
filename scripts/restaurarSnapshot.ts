import { promises as fs } from 'node:fs';
import { carregarEnv } from './carregarEnv';
import { carregarConfig } from '../config/default';
import { criarAuth } from '../src/integrations/google/auth';
import { DriveClient } from '../src/integrations/drive/driveClient';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Sobe um snapshot de volta para o Drive (`pnpm restaurar:snapshot <arquivo>`).
 *
 * Escreve por cima da planilha do cliente, então exige o caminho explícito —
 * nada de "pegar o mais recente" e adivinhar errado.
 */
async function main(): Promise<void> {
  carregarEnv();

  const arquivo = process.argv[2];
  if (!arquivo) {
    throw new Error('Informe o snapshot: pnpm restaurar:snapshot backups/snapshot-....xlsx');
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(arquivo);
  } catch {
    throw new Error(`Snapshot não encontrado: ${arquivo}`);
  }

  const config = carregarConfig();
  const auth = criarAuth();
  const drive = new DriveClient(auth);

  console.log(`Restaurando ${arquivo} (${(bytes.length / 1024).toFixed(1)} KB) por cima da planilha...`);
  await drive.atualizarArquivo(config.spreadsheetId, new Uint8Array(bytes), MIME_XLSX);
  console.log('✅ Planilha voltou ao estado do snapshot.');
}

main().catch((erro: unknown) => {
  console.error('❌ FALHOU:', erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
