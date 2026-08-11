import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

function comboControlado(
  id: string,
  opcoes: Array<[string, string]>,
  fechado = false,
): string {
  return `
    <input id="${id}" role="combobox">
    <div id="${id}-itens"${fechado ? ' hidden' : ''}>
      ${opcoes
        .map(
          ([valor, rotulo]) => `
            <div class="br-item" role="option">
              <div class="br-radio">
                <input id="${valor}" type="radio" value="${valor}" aria-hidden="true" tabindex="-1">
                <label for="${valor}">${rotulo}</label>
              </div>
            </div>`,
        )
        .join('')}
    </div>`;
}

describe('extensão Gerid — comboboxes controlados pelo React', () => {
  it('seleciona o estado civil pelo rótulo visível, não pelo input interno', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.setContent(`
        <style>.br-radio input { position: absolute; opacity: 0; }</style>
        <section id="passo1">
          <h2>Seleção de Serviços</h2>
          ${comboControlado('idSelecionarServico', [
            ['1655', 'Benefício Assistencial à Pessoa com Deficiência'],
          ])}
          <button aria-label="Exibir lista">Exibir lista</button>
        </section>
        <section id="passo2" hidden>
          <h2>Informar Requerente</h2>
          <input id="idRequerente.cpf">
          <button aria-label="Botão de ação" id="consultar">Consultar</button>
          <input id="nomeRequerente">
        </section>
        <section id="passo3" hidden>
          <h2>Autorização CadÚnico</h2>
          <input id="campo-autorizacaoCadunico" type="checkbox">
        </section>
        <section id="passo4" hidden>
          <h2>Grupo Familiar</h2>
          <table><tbody><tr>
            <td>123.456.789-01</td>
            <td>Requerente</td>
            <td>${comboControlado('selectEstadoCivil0', [['1', 'Solteiro']], true)}</td>
          </tr></tbody></table>
          <span class="interaction-select"><input id="undefined-Nao" type="checkbox"><label>Não</label></span>
        </section>
        <section id="passo5" hidden><h2>Comprometimento de Renda</h2></section>
        <button id="btn-next">Avançar</button>
        <script>
          for (const combo of document.querySelectorAll('input[role="combobox"]')) {
            combo.addEventListener('mousedown', () => {
              const caixa = document.getElementById(combo.id + '-itens');
              if (caixa) setTimeout(() => { caixa.hidden = false; }, 100);
            });
          }
          for (const item of document.querySelectorAll('[id$="-itens"] [role="option"]')) {
            item.addEventListener('mousedown', (evento) => {
              if (evento.target !== item) return;
              const caixa = item.closest('[id$="-itens"]');
              const label = item.querySelector('label');
              const combo = document.getElementById(caixa.id.slice(0, -6));
              const radio = document.getElementById(label.htmlFor);
              combo.value = label.textContent.trim();
              radio.checked = true;
            });
          }
          for (const tag of document.querySelectorAll('.interaction-select')) {
            tag.addEventListener('click', () => { tag.querySelector('input').checked = true; });
          }
          document.querySelector('#consultar').addEventListener('click', () => {
            document.querySelector('#nomeRequerente').value = 'Pessoa de Teste';
          });
          document.querySelector('#btn-next').addEventListener('click', () => {
            const passos = [...document.querySelectorAll('section')];
            const atual = passos.findIndex((passo) => !passo.hidden);
            if (atual >= 0 && atual < passos.length - 1) {
              passos[atual].hidden = true;
              passos[atual + 1].hidden = false;
            }
          });
        </script>
      `);

      await pagina.evaluate(() => {
        (window as any).__geridReactMessages = [];
        (window as any).__geridReactDirectCalls = [];
        (window as any).chrome = {
          runtime: {
            sendMessage: async (mensagem: any) => {
              if (mensagem.action !== 'gerid_react_control') return undefined;
              (window as any).__geridReactMessages.push(mensagem);
              if (mensagem.tipo === 'combobox') {
                const combo = document.getElementById(mensagem.id) as HTMLInputElement | null;
                if (combo) combo.value = mensagem.valor;
              }
              if (mensagem.tipo === 'marcar') {
                const input = document.getElementById(mensagem.id) as HTMLInputElement | null;
                if (input) input.checked = true;
              }
              return { ok: true, motivo: 'react' };
            },
          },
        };

        for (const item of document.querySelectorAll<HTMLElement>('[id$="-itens"] .br-item')) {
          Object.defineProperty(item, '__reactProps$teste', {
            enumerable: true,
            value: {
              onMouseDown: () => {
                const caixa = item.closest<HTMLElement>('[id$="-itens"]');
                const label = item.querySelector<HTMLLabelElement>('label');
                const combo = document.getElementById(
                  caixa?.id.slice(0, -6) ?? '',
                ) as HTMLInputElement | null;
                const radio = document.getElementById(label?.htmlFor ?? '') as HTMLInputElement | null;
                if (combo && label) combo.value = label.textContent?.trim() ?? '';
                if (radio) radio.checked = true;
                (window as any).__geridReactDirectCalls.push({ tipo: 'combobox', id: combo?.id });
              },
            },
          });
        }
        for (const controle of document.querySelectorAll<HTMLElement>('.interaction-select')) {
          Object.defineProperty(controle, '__reactProps$teste', {
            enumerable: true,
            value: {
              onClick: () => {
                const input = controle.querySelector<HTMLInputElement>('input');
                if (input) input.checked = true;
                (window as any).__geridReactDirectCalls.push({ tipo: 'marcar', id: input?.id });
              },
            },
          });
        }
      });

      // Reproduz o carrossel do GERID real: os controles possuem geometria e
      // estilo visivel, mas offsetParent e null em toda a etapa 4.
      await pagina.evaluate(() => {
        const getterOriginal = Object.getOwnPropertyDescriptor(
          HTMLElement.prototype,
          'offsetParent',
        )?.get;
        Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
          configurable: true,
          get() {
            if ((this as HTMLElement).closest('#passo4')) return null;
            if ((this as HTMLElement).closest('[hidden]')) return null;
            return getterOriginal?.call(this) ?? document.body;
          },
        });
      });

      const bundle = await readFile(path.join(process.cwd(), 'extensao-gerid', 'content.js'), 'utf8');
      await pagina.addScriptTag({ content: bundle });
      const execucao = pagina.evaluate(() =>
        (window as any).iniciarProcessamento({
          nome: 'Pessoa de Teste',
          dados: {
            cliente: { cpf: '12345678901', nome: 'Pessoa de Teste' },
            grupoFamiliar: {
              requerenteCpf: '12345678901',
              integrantes: [{ cpf: '12345678901', parentesco: 'Titular' }],
            },
          },
          configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
          anexos: [],
        }),
      );

      await pagina.waitForFunction(() => !document.querySelector<HTMLElement>('#passo5')?.hidden);
      expect(await pagina.inputValue('#selectEstadoCivil0')).toBe('Solteiro');
      expect(await pagina.evaluate(() => (window as any).__geridReactDirectCalls)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tipo: 'combobox', id: 'selectEstadoCivil0' }),
          expect.objectContaining({ tipo: 'marcar', id: 'undefined-Nao' }),
        ]),
      );
      expect(await pagina.evaluate(() => (window as any).__geridReactMessages)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'selectEstadoCivil0' }),
          expect.objectContaining({ id: 'undefined-Nao' }),
        ]),
      );
      await execucao;
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 20_000);
});
