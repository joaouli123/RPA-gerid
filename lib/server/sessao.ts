/**
 * Sessão assinada em cookie.
 *
 * Usa Web Crypto (não `node:crypto`) de propósito: o middleware do Next roda
 * no Edge runtime, onde `node:crypto` não existe. Assim o MESMO código valida
 * a sessão no middleware e nas rotas.
 *
 * O cookie guarda apenas `{ sub, exp }` + assinatura HMAC. Não há dado
 * sensível dentro dele, e sem o segredo não dá para forjar.
 */

export const COOKIE_SESSAO = 'rpa_sessao';

/** Validade da sessão: 8 horas (um turno de trabalho). */
export const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;

interface Payload {
  /** Identificador do usuário (e-mail). */
  sub: string;
  /** Expiração, em epoch ms. */
  exp: number;
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Segredo de assinatura. Sem ele configurado, a aplicação não autentica. */
export function segredoSessao(): string {
  const s = process.env.RPA_SESSAO_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error(
      'RPA_SESSAO_SECRET ausente ou curto demais (mínimo 32 caracteres). Configure no .env / nas variáveis do servidor.',
    );
  }
  return s;
}

/** Cria o valor do cookie de sessão. */
export async function criarSessao(sub: string, agora = Date.now()): Promise<string> {
  const payload: Payload = { sub, exp: agora + DURACAO_SESSAO_MS };
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const chave = await chaveHmac(segredoSessao());
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  return `${corpo}.${base64url(new Uint8Array(assinatura))}`;
}

/**
 * Valida o cookie. Devolve o payload ou null.
 * A verificação da assinatura usa `crypto.subtle.verify`, que é constante no
 * tempo — não dá para descobrir a assinatura por tentativa e erro.
 */
export async function lerSessao(cookie: string | undefined | null): Promise<Payload | null> {
  if (!cookie) return null;
  const [corpo, assinatura] = cookie.split('.');
  if (!corpo || !assinatura) return null;

  try {
    const chave = await chaveHmac(segredoSessao());
    const valida = await crypto.subtle.verify(
      'HMAC',
      chave,
      deBase64url(assinatura),
      new TextEncoder().encode(corpo),
    );
    if (!valida) return null;

    const payload = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as Payload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}
