import { afterEach, describe, expect, it } from 'vitest';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';

const original = process.env.RPA_EXTENSAO_TOKEN;

afterEach(() => {
  if (original === undefined) delete process.env.RPA_EXTENSAO_TOKEN;
  else process.env.RPA_EXTENSAO_TOKEN = original;
});

describe('autorização da extensão', () => {
  it('recusa chamadas enquanto a chave não foi configurada', () => {
    delete process.env.RPA_EXTENSAO_TOKEN;
    expect(autorizarExtensao(new Request('https://rpa.test/api/ext/fila')).ok).toBe(false);
  });

  it('aceita somente o bearer token configurado', () => {
    process.env.RPA_EXTENSAO_TOKEN = 'chave-de-teste';
    expect(
      autorizarExtensao(
        new Request('https://rpa.test/api/ext/fila', {
          headers: { Authorization: 'Bearer chave-de-teste' },
        }),
      ).ok,
    ).toBe(true);
    expect(autorizarExtensao(new Request('https://rpa.test/api/ext/fila')).ok).toBe(false);
  });
});
