import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensão Gerid — combobox controlado de serviço', () => {
  it('clica na opção visível e só avança depois que o campo recebe o serviço', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        (window as any).chrome = {
          runtime: { sendMessage: async () => undefined },
        };
      });
      await pagina.setContent(`
        <section id="passo1">
          <h2>Seleção de Serviços</h2>
          <input id="idSelecionarServico" role="combobox" aria-label="Selecione um Serviço">
          <button id="abrir-lista" aria-label="Exibir lista">Exibir lista</button>
          <div id="idSelecionarServico-itens" role="listbox" hidden>
            <div id="opcao-bpc" role="option">
              <label for="1655">Benefício Assistencial à Pessoa com Deficiência</label>
              <span>Atendimento à distância</span>
              <span>Benefício Assistencial à Pessoa com Deficiência Atendimento à distância</span>
              <input id="1655" type="radio" value="1655" hidden>
            </div>
          </div>
        </section>
        <section id="passo2" hidden>
          <input id="idRequerente.cpf">
          <button id="consultar-cpf" aria-label="Botão de ação">Consultar</button>
          <input id="nomeRequerente" value="">
        </section>
        <button id="btn-next" disabled>Avançar</button>
        <script>
          const combo = document.querySelector('#idSelecionarServico');
          const radio = document.querySelector('input[id="1655"]');
          const cpf = document.querySelector('input[id="idRequerente.cpf"]');
          const descritorValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          let valorRastreado = descritorValor.get.call(cpf);
          Object.defineProperty(cpf, 'value', {
            configurable: true,
            get() { return descritorValor.get.call(cpf); },
            set(valor) {
              valorRastreado = String(valor);
              descritorValor.set.call(cpf, valor);
            },
          });
          cpf.addEventListener('input', () => {
            const valorDom = descritorValor.get.call(cpf);
            if (valorDom !== valorRastreado) {
              cpf.dataset.reactAtualizado = 'sim';
              valorRastreado = valorDom;
            }
          });
          document.querySelector('#abrir-lista').addEventListener('click', () => {
            document.querySelector('#idSelecionarServico-itens').hidden = false;
          });
          document.querySelector('#opcao-bpc').addEventListener('click', (evento) => {
            if (evento.target !== evento.currentTarget) return;
            radio.checked = true;
            combo.value = 'Benefício Assistencial à Pessoa com Deficiência';
            combo.dispatchEvent(new Event('input', { bubbles: true }));
            combo.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => { document.querySelector('#btn-next').disabled = false; }, 300);
          });
          document.querySelector('#btn-next').addEventListener('click', () => {
            if (!document.querySelector('#passo1').hidden && combo.value === 'Benefício Assistencial à Pessoa com Deficiência') {
              document.querySelector('#passo1').hidden = true;
              document.querySelector('#passo2').hidden = false;
            } else if (!document.querySelector('#passo2').hidden) {
              document.querySelector('#passo2').hidden = true;
            }
          });
          document.querySelector('#consultar-cpf').addEventListener('click', (evento) => {
            evento.currentTarget.dataset.clicado = 'sim';
            document.querySelector('#nomeRequerente').value = 'Pessoa de Teste';
          });
        </script>
      `);

      const bundle = await readFile(
        path.join(process.cwd(), 'extensao-gerid', 'content.js'),
        'utf8',
      );
      await pagina.addScriptTag({ content: bundle });

      await pagina.evaluate(() => {
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
        const combo = document.querySelector<HTMLInputElement>('#idSelecionarServico');
        const cpf = document.querySelector<HTMLInputElement>('input[id="idRequerente.cpf"]');
        return combo?.value === 'Benefício Assistencial à Pessoa com Deficiência'
          && cpf?.value === '12345678901'
          && cpf?.dataset.reactAtualizado === 'sim';
      }, undefined, { timeout: 13_000 });

      expect(await pagina.inputValue('#idSelecionarServico')).toBe(
        'Benefício Assistencial à Pessoa com Deficiência',
      );
      expect(await pagina.inputValue('input[id="idRequerente.cpf"]')).toBe('12345678901');
      expect(
        await pagina.getAttribute('input[id="idRequerente.cpf"]', 'data-react-atualizado'),
      ).toBe('sim');
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 25_000);
});
