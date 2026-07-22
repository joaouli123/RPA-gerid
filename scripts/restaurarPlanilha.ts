import { promises as fs } from 'node:fs';
import path from 'node:path';
import { carregarEnv } from './carregarEnv';
import { carregarConfig } from '../config/default';
import { criarAuth } from '../src/integrations/google/auth';
import { DriveClient } from '../src/integrations/drive/driveClient';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Restaura a planilha do Drive a partir do backup local (`pnpm restaurar`).
 * O backup é criado automaticamente antes da primeira gravação do sistema.
 */
async function main(): Promise<void> {
  carregarEnv();

  const config = carregarConfig();
  const backup = path.join(
    process.cwd(),
    'backups',
    `planilha-original-${config.spreadsheetId}.xlsx`,
  );

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(backup);
  } catch {
    throw new Error(`Backup não encontrado em ${backup}. Nada a restaurar.`);
  }

  const auth = criarAuth();
  const drive = new DriveClient(auth);

  console.log(`Restaurando a planilha a partir de ${backup} (${(bytes.length / 1024).toFixed(1)} KB)...`);
  await drive.atualizarArquivo(config.spreadsheetId, new Uint8Array(bytes), MIME_XLSX);
  console.log('✅ Planilha restaurada ao estado original.');
}

main().catch((erro: unknown) => {
  console.error('❌ FALHOU:', erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
