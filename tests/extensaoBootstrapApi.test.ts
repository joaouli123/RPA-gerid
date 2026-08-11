import { afterEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/ext/bootstrap/route';

const tokenOriginal = process.env.RPA_EXTENSAO_TOKEN;

afterEach(() => {
  if (tokenOriginal === undefined) delete process.env.RPA_EXTENSAO_TOKEN;
  else process.env.RPA_EXTENSAO_TOKEN = tokenOriginal;
});

describe('GET /api/ext/bootstrap', () => {
  it('entrega a autorizacao somente sem cache', async () => {
    process.env.RPA_EXTENSAO_TOKEN = 'token-teste';
    const resposta = await GET();

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    await expect(resposta.json()).resolves.toEqual({ sucesso: true, token: 'token-teste' });
  });

  it('falha fechada quando o servidor nao possui token', async () => {
    delete process.env.RPA_EXTENSAO_TOKEN;
    const resposta = await GET();

    expect(resposta.status).toBe(503);
  });
});
