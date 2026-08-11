import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensao Gerid - bloqueios conhecidos do PAT', () => {
  it('autoriza abrangencia e A3 sem confirmar o protocolo', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        (window as any).chrome = {
          runtime: { sendMessage: async () => undefined },
        };
      });
      await pagina.setContent(`
        <main>
          <h1>LOGIN - PAT</h1>
          <p>A aplicacao PAT solicita acesso as informacoes sobre voce.</p>
          <label>Abrangencia
            <select id="abrangencia">
              <option value="">Selecione uma Opcao</option>
              <option value="cnpj">CNPJ:02656759000152.CNPJ</option>
            </select>
          </label>
          <label>Papel
            <select id="papel">
              <option value="">Selecione uma Opcao</option>
            </select>
          </label>
          <button id="autorizar" disabled>Autorizo</button>
        </main>
        <script>
          const abrangencia = document.querySelector('#abrangencia');
          const papel = document.querySelector('#papel');
          const autorizar = document.querySelector('#autorizar');
          abrangencia.addEventListener('change', () => {
            if (abrangencia.value && papel.options.length === 1) {
              papel.add(new Option('ENTIDADE_CONVENIADA_OAB', 'oab'));
            }
          });
          papel.addEventListener('change', () => {
            autorizar.disabled = papel.value !== 'oab';
          });
          autorizar.addEventListener('click', () => {
            document.body.innerHTML = \`
              <div role="dialog">
                <p>Para usar este sistema, e preciso ter um certificado digital do tipo A3.</p>
                <button id="ok-a3">Ok</button>
              </div>
            \`;
            document.querySelector('#ok-a3').addEventListener('click', () => {
              document.body.innerHTML = \`
                <div role="dialog"><h1>Atencao</h1><button id="confirmar">Confirmar</button></div>
              \`;
              document.querySelector('#confirmar').addEventListener('click', () => {
                document.body.dataset.protocoloConfirmado = 'sim';
              });
            });
          });
        </script>
      `);

      const bundle = await readFile(
        path.join(process.cwd(), 'extensao-gerid', 'content.js'),
        'utf8',
      );
      await pagina.addScriptTag({ content: bundle });

      const autorizacao = await pagina.evaluate(() =>
        (window as any).resolverBloqueiosGerid(),
      );
      expect(autorizacao.estado).toBe('navegando');
      expect(await pagina.locator('text=certificado digital do tipo A3').count()).toBe(1);

      const avisoA3 = await pagina.evaluate(() =>
        (window as any).resolverBloqueiosGerid(),
      );
      expect(avisoA3.estado).toBe('navegando');
      expect(await pagina.locator('text=Atencao').count()).toBe(1);

      const confirmacao = await pagina.evaluate(() =>
        (window as any).resolverBloqueiosGerid(),
      );
      expect(confirmacao.estado).toBe('revisao_manual');
      expect(await pagina.locator('body').getAttribute('data-protocolo-confirmado')).toBeNull();
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 30_000);
});
