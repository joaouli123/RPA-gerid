import path from 'node:path';
import { montarModelo } from './modeloPlanilha';

/** Gera docs/Protocolo-modelo.xlsx para o escritório preencher (`pnpm modelo`). */
const SAIDA = path.join(process.cwd(), 'docs', 'Protocolo-modelo.xlsx');

async function main(): Promise<void> {
  const workbook = montarModelo();
  await workbook.xlsx.writeFile(SAIDA);
  console.log(`Modelo gerado em: ${SAIDA}`);
}

main().catch((erro) => {
  console.error('Falha ao gerar o modelo:', erro);
  process.exitCode = 1;
});
