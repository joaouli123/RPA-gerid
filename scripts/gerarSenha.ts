import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { gerarHashSenha } from '../lib/server/auth';

/**
 * Gera o hash de uma senha para `RPA_AUTH_SENHA_HASH` (`pnpm senha:hash`).
 *
 * A senha é digitada na hora e NUNCA é gravada em arquivo nem impressa —
 * só o hash aparece. Use isto para trocar a senha sem passá-la para ninguém.
 */
async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const senha = await rl.question('Nova senha: ');
  rl.close();

  if (senha.length < 10) {
    throw new Error('Senha curta demais. Use pelo menos 10 caracteres.');
  }

  const salt = randomBytes(16).toString('hex');
  const hash = await gerarHashSenha(senha, salt);

  console.log('\nColoque no .env (local) e nas variáveis do servidor:\n');
  console.log(`RPA_AUTH_SENHA_HASH=${hash}`);
  console.log('\nA senha em si não foi salva em lugar nenhum.');
}

main().catch((erro: unknown) => {
  console.error('Falhou:', erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
