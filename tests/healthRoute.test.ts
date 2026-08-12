import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/health/route';
import { middleware } from '../middleware';

describe('GET /api/health', () => {
  it('expõe a versão implantada sem revelar configuração sensível', async () => {
    const resposta = await GET();
    expect(resposta.status).toBe(200);

    const corpo = await resposta.json();
    // As chaves são fechadas: esta é a única rota da API que o middleware
    // libera sem sessão, então nada entra aqui por descuido.
    expect(Object.keys(corpo).sort()).toEqual(['commit', 'iniciadoEm', 'release', 'status']);
    expect(corpo.status).toBe('ok');
    expect(corpo.release).toBe('gerid-rpa-1.4.0');
    expect(corpo.iniciadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('diz em que commit a produção está, para não depender da memória de ninguém', async () => {
    const anterior = process.env.RPA_COMMIT;
    try {
      // Sem o build arg (rodando local, por exemplo) a resposta é honesta em vez
      // de inventar uma versão.
      delete process.env.RPA_COMMIT;
      expect((await (await GET()).json()).commit).toBe('desconhecido');

      process.env.RPA_COMMIT = '73f03ce1234567890abcdef';
      expect((await (await GET()).json()).commit).toBe('73f03ce12345');
    } finally {
      if (anterior === undefined) delete process.env.RPA_COMMIT;
      else process.env.RPA_COMMIT = anterior;
    }
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
