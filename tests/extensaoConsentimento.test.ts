import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensao Gerid - consentimento de privacidade', () => {
  it('nao busca dados do caso antes do aceite explicito', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        const storage: Record<string, any> = {
          apiUrl: 'https://rpa.teste',
          apiToken: 'segredo',
          modoTeste: true,
        };
        (window as any).__fetches = 0;
        (window as any).chrome = {
          runtime: {
            getManifest: () => ({ version: '1.4.0' }),
            onMessage: { addListener: () => undefined },
            sendMessage: async () => undefined,
          },
          storage: {
            local: {
              get: async (chaves: string[], callback?: (resultado: any) => void) => {
                const resultado = Object.fromEntries(
                  chaves.filter((chave) => chave in storage).map((chave) => [chave, storage[chave]]),
                );
                callback?.(resultado);
                return resultado;
              },
              set: async (valores: Record<string, any>) => Object.assign(storage, valores),
            },
          },
        };
        (window as any).fetch = async () => {
          (window as any).__fetches++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ sucesso: true, idExecucao: null, casos: [] }),
          };
        };
      });

      const html = (await readFile(
        path.join(process.cwd(), 'extensao-gerid', 'popup.html'),
        'utf8',
      )).replace('<script src="popup.js"></script>', '');
      await pagina.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await pagina.addScriptTag({
        content: await readFile(path.join(process.cwd(), 'extensao-gerid', 'popup.js'), 'utf8'),
      });
      await pagina.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));

      await expect.poll(() => pagina.locator('#consentBox').isVisible()).toBe(true);
      expect(await pagina.evaluate(() => (window as any).__fetches)).toBe(0);
      expect(await pagina.locator('#btnStart').isDisabled()).toBe(true);

      await pagina.locator('#btnConsent').click();
      await expect.poll(() => pagina.evaluate(() => (window as any).__fetches)).toBe(1);
      expect(await pagina.locator('#consentBox').isHidden()).toBe(true);
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 20_000);
});
