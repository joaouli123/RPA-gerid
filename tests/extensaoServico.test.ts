import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensão Gerid — seleção do serviço', () => {
  it('abre a lista, seleciona o serviço 1655 e avança para preencher o CPF', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    const mensagens: string[] = [];
    pagina.on('console', (mensagem) => mensagens.push(mensagem.text()));
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
        <script>
          document.querySelector('#abrir-lista').addEventListener('click', () => {
            document.querySelector('#idSelecionarServico-itens').hidden = false;
          });
          document.querySelector('#btn-next').addEventListener('click', () => {
            const passo1 = document.querySelector('#passo1');
            const passo2 = document.querySelector('#passo2');
            if (!passo1.hidden && document.querySelector('input[id="1655"]').checked) {
              passo1.hidden = true;
              passo2.hidden = false;
            } else if (!passo2.hidden) {
              passo2.hidden = true;
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

      try {
        await pagina.waitForFunction(() => {
          const radio = document.querySelector<HTMLInputElement>('#idSelecionarServico-itens input[id="1655"]');
          const cpf = document.querySelector<HTMLInputElement>('input[id="idRequerente.cpf"]');
          const consulta = document.querySelector<HTMLElement>('#consultar-cpf');
          return radio?.checked && cpf?.value === '12345678901' && consulta?.dataset.clicado === 'sim';
        }, undefined, { timeout: 8_000 });
      } catch {
        const estado = await pagina.evaluate(() => ({
          listaAberta: !(document.querySelector<HTMLElement>('#idSelecionarServico-itens')?.hidden),
          radioMarcado: document.querySelector<HTMLInputElement>('input[id="1655"]')?.checked,
          passo1Oculto: document.querySelector<HTMLElement>('#passo1')?.hidden,
          passo2Oculto: document.querySelector<HTMLElement>('#passo2')?.hidden,
          cpf: document.querySelector<HTMLInputElement>('input[id="idRequerente.cpf"]')?.value,
          consultaClicada: document.querySelector<HTMLElement>('#consultar-cpf')?.dataset.clicado,
        }));
        throw new Error(`Fluxo não avançou: ${JSON.stringify({ estado, mensagens })}`);
      }

      expect(await pagina.isChecked('#idSelecionarServico-itens input[id="1655"]')).toBe(true);
      expect(await pagina.inputValue('input[id="idRequerente.cpf"]')).toBe('12345678901');
      expect(await pagina.getAttribute('#consultar-cpf', 'data-clicado')).toBe('sim');
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 30_000);
});
