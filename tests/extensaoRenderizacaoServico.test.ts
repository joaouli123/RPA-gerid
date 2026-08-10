import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensão Gerid — renderização tardia do passo de serviço', () => {
  it('aguarda a SPA exibir o serviço antes de iniciar o preenchimento', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        (window as any).chrome = {
          runtime: { sendMessage: async () => undefined },
        };
      });
      await pagina.setContent('<main id="app"></main>');

      const bundle = await readFile(
        path.join(process.cwd(), 'extensao-gerid', 'content.js'),
        'utf8',
      );
      await pagina.addScriptTag({ content: bundle });

      await pagina.evaluate(() => {
        setTimeout(() => {
          document.querySelector('#app')!.innerHTML = `
            <section id="passo1">
              <h2>Seleção de Serviços</h2>
              <input id="idSelecionarServico" role="combobox" aria-label="Selecione um Serviço">
              <button id="abrir-lista" aria-label="Exibir lista">Exibir lista</button>
              <div id="idSelecionarServico-itens" hidden>
                <label for="1655">Benefício Assistencial à Pessoa com Deficiência</label>
                <input id="1655" type="radio" value="1655">
              </div>
            </section>
            <section id="passo2" hidden>
              <input id="idRequerente.cpf">
              <button id="consultar-cpf" aria-label="Botão de ação">Consultar</button>
              <input id="nomeRequerente" value="">
            </section>
            <button id="btn-next">Avançar</button>
          `;
          document.querySelector('#abrir-lista')!.addEventListener('click', () => {
            document.querySelector<HTMLElement>('#idSelecionarServico-itens')!.hidden = false;
          });
          document.querySelector('#btn-next')!.addEventListener('click', () => {
            const passo1 = document.querySelector<HTMLElement>('#passo1')!;
            const passo2 = document.querySelector<HTMLElement>('#passo2')!;
            if (!passo1.hidden && document.querySelector<HTMLInputElement>('#idSelecionarServico-itens input[id="1655"]')!.checked) {
              passo1.hidden = true;
              passo2.hidden = false;
            } else if (!passo2.hidden) {
              passo2.hidden = true;
            }
          });
          document.querySelector('#consultar-cpf')!.addEventListener('click', (evento) => {
            (evento.currentTarget as HTMLElement).dataset.clicado = 'sim';
            document.querySelector<HTMLInputElement>('#nomeRequerente')!.value = 'Pessoa de Teste';
          });
        }, 500);

        const caso = {
          nome: 'Pessoa de Teste',
          dados: {
            cliente: { cpf: '12345678901', nome: 'Pessoa de Teste' },
            grupoFamiliar: { requerenteCpf: '12345678901', integrantes: [] },
          },
          configuracao: {
            procuradorCpf: '00000000000',
            telefonePadrao: '',
            emailEscritorio: '',
          },
          anexos: [],
        };
        (window as any).__execucaoTeste = (window as any).iniciarProcessamento(caso);
      });

      await pagina.waitForFunction(() => {
        const radio = document.querySelector<HTMLInputElement>('#idSelecionarServico-itens input[id="1655"]');
        const cpf = document.querySelector<HTMLInputElement>('input[id="idRequerente.cpf"]');
        const consulta = document.querySelector<HTMLElement>('#consultar-cpf');
        return radio?.checked && cpf?.value === '12345678901' && consulta?.dataset.clicado === 'sim';
      }, undefined, { timeout: 8_000 });

      expect(await pagina.isChecked('#idSelecionarServico-itens input[id="1655"]')).toBe(true);
      expect(await pagina.inputValue('input[id="idRequerente.cpf"]')).toBe('12345678901');
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 20_000);
});
