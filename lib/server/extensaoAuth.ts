import { timingSafeEqual } from 'node:crypto';

/**
 * Autoriza a extensão instalada no navegador do operador.
 *
 * As rotas /api/ext são públicas para o Chrome poder chamá-las, mas carregam
 * dados pessoais e documentos. Por isso nunca podem aceitar uma chamada sem a
 * chave configurada no Coolify.
 */
export function autorizarExtensao(req: Request): { ok: true } | { ok: false; erro: string } {
  const esperado = process.env.RPA_EXTENSAO_TOKEN?.trim();
  if (!esperado) {
    return { ok: false, erro: 'A chave da extensão não foi configurada no servidor.' };
  }

  const recebido = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, erro: 'Extensão não autorizada.' };
  }
  return { ok: true };
}
