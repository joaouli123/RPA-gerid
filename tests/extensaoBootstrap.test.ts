import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensao Gerid - autorizacao automatica', () => {
  it('recebe a autorizacao pela sessao do painel sem exibir a chave', async () => {
    const navegador = await chromium.launch({ headless: true });
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    try {
      await pagina.route('https://rpa.teste/api/ext/bootstrap', async (rota) => {
        await rota.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sucesso: true, token: 'token-automatico' }),
        });
      });
      await pagina.route('https://rpa.teste/painel', async (rota) => {
        await rota.fulfill({ status: 200, contentType: 'text/html', body: '<main>Painel</main>' });
      });
      await pagina.addInitScript(() => {
        (window as any).__storage = {};
        (window as any).chrome = {
          runtime: { sendMessage: async () => undefined },
          storage: {
            local: {
              set: async (valores: Record<string, unknown>) => {
                Object.assign((window as any).__storage, valores);
              },
            },
          },
        };
      });
      await pagina.goto('https://rpa.teste/painel');
      const script = (await readFile(
        path.join(process.cwd(), 'extensao-gerid', 'bootstrap.js'),
        'utf8',
      )).replace(
        'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io',
        'https://rpa.teste',
      );
      await pagina.addScriptTag({ content: script });

      await expect.poll(() => pagina.evaluate(() => (window as any).__storage.apiToken))
        .toBe('token-automatico');
      expect(await pagina.evaluate(() => (window as any).__storage.apiUrl))
        .toBe('https://rpa.teste');
    } finally {
      await contexto.close();
      await navegador.close();
    }
  });

  it('nao possui campo de chave no popup', async () => {
    const html = await readFile(path.join(process.cwd(), 'extensao-gerid', 'popup.html'), 'utf8');
    expect(html).not.toContain('id="apiToken"');
    expect(html).not.toContain('Chave da extensao');
    expect(html).not.toContain('Chave da extensão');
  });
});
