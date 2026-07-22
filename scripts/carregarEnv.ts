import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Carrega o .env nos scripts avulsos.
 * O Next.js faz isso sozinho, mas `tsx scripts/...` não — sem isto os scripts
 * de teste não enxergam a credencial.
 *
 * Suporta valores com parênteses e espaços (ex.: telefone "(62) 99353-3633"),
 * que quebram o `source` do bash.
 */
export function carregarEnv(arquivo = path.join(process.cwd(), '.env')): void {
  let conteudo: string;
  try {
    conteudo = readFileSync(arquivo, 'utf8');
  } catch {
    return; // sem .env: segue com as variáveis já existentes
  }

  for (const linha of conteudo.split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;

    const igual = texto.indexOf('=');
    if (igual === -1) continue;

    const chave = texto.slice(0, igual).trim();
    let valor = texto.slice(igual + 1).trim();

    // Remove aspas envolventes, se houver.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    // Variável já definida no ambiente tem prioridade.
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}
