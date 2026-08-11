import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/health/route';
import { middleware } from '../middleware';

describe('GET /api/health', () => {
  it('expõe a versão implantada sem revelar configuração sensível', async () => {
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      status: 'ok',
      release: 'gerid-rpa-1.4.0',
    });
  });

  it('é público para permitir a verificação externa do Coolify', async () => {
    const resposta = await middleware(new NextRequest('https://rpa.test/api/health'));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('x-middleware-next')).toBe('1');
  });

  it('mantem a politica de privacidade publica para a Chrome Web Store', async () => {
    const resposta = await middleware(new NextRequest('https://rpa.test/privacidade-extensao'));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('x-middleware-next')).toBe('1');
  });

  it('protege a entrega automatica da autorizacao da extensao com a sessao do painel', async () => {
    const resposta = await middleware(new NextRequest('https://rpa.test/api/ext/bootstrap'));
    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({ erro: 'nao_autenticado' });
  });
});
