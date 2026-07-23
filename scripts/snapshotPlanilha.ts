import { promises as fs } from 'node:fs';
import path from 'node:path';
import { carregarEnv } from './carregarEnv';
import { carregarConfig } from '../config/default';
import { criarAuth } from '../src/integrations/google/auth';
import { DriveClient } from '../src/integrations/drive/driveClient';

/**
 * Baixa a planilha do Drive como ela está AGORA (`pnpm snapshot`).
 *
 * Diferente de `backups/planilha-original-*.xlsx`, que guarda o estado
 * anterior à migração de schema e não deve ser sobrescrito, este snapshot é
 * datado: serve para desfazer uma sessão de testes, ou uma edição errada,
 * voltando ao ponto exato de antes.
 *
 * Restaurar um snapshot: `pnpm restaurar:snapshot <arquivo>`.
 */
async function main(): Promise<void> {
  carregarEnv();

  const config = carregarConfig();
  const auth = criarAuth();
  const drive = new DriveClient(auth);

  const bytes = await drive.baixarArquivo(config.spreadsheetId);

  // Sem `:` nem `.` no nome — o Windows não aceita nos dois primeiros casos.
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(process.cwd(), 'backups', `snapshot-${carimbo}.xlsx`);

  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, bytes);

  console.log(`✅ Snapshot salvo: ${destino} (${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log(`   Para desfazer: pnpm restaurar:snapshot "${destino}"`);
}

main().catch((erro: unknown) => {
  console.error('❌ FALHOU:', erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
