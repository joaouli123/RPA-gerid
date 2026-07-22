import { carregarConfig } from '../config/default';
import { lerDados } from '../src/modulo1/lerDados';
import { imprimirResultado } from '../src/relatorio/imprimir';
import { criarDemo } from './demoData';

/**
 * Dry-run do Módulo 1 contra dados de EXEMPLO em memória (sem Drive/Sheets
 * reais, sem credenciais). Prova o fluxo ponta a ponta. Rode com `pnpm demo`.
 */
async function main(): Promise<void> {
  const config = carregarConfig({ ...process.env, RPA_PASTA_RAIZ_ID: 'demo', RPA_SPREADSHEET_ID: 'demo' });
  const { drive, sheets } = criarDemo();
  const resultado = await lerDados(config, drive, sheets);
  imprimirResultado(resultado);
}

main().catch((err) => {
  console.error('Falha no dry-run:', err);
  process.exitCode = 1;
});
