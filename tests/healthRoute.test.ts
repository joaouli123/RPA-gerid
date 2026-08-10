import { describe, expect, it } from 'vitest';
import { GET } from '../app/api/health/route';

describe('GET /api/health', () => {
  it('expõe a versão implantada sem revelar configuração sensível', async () => {
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      status: 'ok',
      release: 'gerid-rpa-1.0.3',
    });
  });
});
