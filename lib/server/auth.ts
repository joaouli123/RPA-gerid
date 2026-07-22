import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  senha: string,
  salt: string,
  tamanho: number,
) => Promise<Buffer>;

/**
 * Verificação de credenciais.
 *
 * A senha NUNCA fica no código nem no repositório: só o hash scrypt vive em
 * `RPA_AUTH_SENHA_HASH` (formato `salt:hash`), e o `.env` é git-ignored.
 *
 * Roda apenas no runtime Node (Server Action), nunca no middleware Edge.
 */

const TAMANHO_HASH = 64;

export function emailAutorizado(): string {
  const email = process.env.RPA_AUTH_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error('RPA_AUTH_EMAIL não configurado. Sem isso ninguém consegue entrar.');
  }
  return email;
}

function hashConfigurado(): { salt: string; hash: Buffer } {
  const bruto = process.env.RPA_AUTH_SENHA_HASH?.trim();
  if (!bruto || !bruto.includes(':')) {
    throw new Error(
      'RPA_AUTH_SENHA_HASH não configurado (esperado "salt:hash"). Gere com `pnpm senha:hash`.',
    );
  }
  const [salt, hash] = bruto.split(':');
  if (!salt || !hash) throw new Error('RPA_AUTH_SENHA_HASH mal formatado.');
  return { salt, hash: Buffer.from(hash, 'hex') };
}

/** Gera o valor de RPA_AUTH_SENHA_HASH para uma senha. */
export async function gerarHashSenha(senha: string, salt: string): Promise<string> {
  const derivado = await scryptAsync(senha, salt, TAMANHO_HASH);
  return `${salt}:${derivado.toString('hex')}`;
}

/**
 * Confere e-mail + senha.
 *
 * Compara com `timingSafeEqual` e sempre roda o scrypt, mesmo com e-mail
 * errado: se retornasse cedo, o tempo de resposta revelaria se o e-mail
 * existe (enumeração de usuário).
 */
export async function credenciaisValidas(email: string, senha: string): Promise<boolean> {
  const { salt, hash } = hashConfigurado();
  const derivado = await scryptAsync(senha, salt, TAMANHO_HASH);

  const emailOk = email.trim().toLowerCase() === emailAutorizado();
  const senhaOk = derivado.length === hash.length && timingSafeEqual(derivado, hash);

  return emailOk && senhaOk;
}
