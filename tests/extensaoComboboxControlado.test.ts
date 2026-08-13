import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

// ⚠️ O id do radio leva o id do combo junto: `2` é "Filho(a)" no parentesco e
// "Casado" no estado civil, e com o id repetido o clique em `<label for="2">`
// caía no primeiro radio "2" da página inteira. O `value` continua sendo só a
// opção, que é o que o handler React do GERID lê. Ids únicos é o que o GERID
// real entrega.
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
                <input id="${id}-op-${valor}" type="radio" value="${valor}" aria-hidden="true" tabindex="-1">
                <label for="${id}-op-${valor}">
                  <span aria-hidden="true"><div>${rotulo}</div></span>
                  <span class="sr-only">${rotulo}</span>
                </label>
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
    pagina.on("console", (m) => { const t = m.text(); if (t[0] === "[") console.log(String(Date.now()%100000)+" "+t); });
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
          <table><tbody>
            <tr>
              <!--
                CPF SEM os zeros à esquerda, de propósito: é assim que o CadÚnico
                entrega quando o valor viaja como número. Na planilha ele tem 11
                dígitos (00111111111) e aqui chega com 9. São a mesma pessoa, e
                em 13/08/2026 (ANA LUCIA) o robô não percebeu isso: acusou a
                filha como "veio do CadÚnico mas não está na planilha" E como
                "está na planilha mas o GERID não listou", ficou sem o parentesco
                dela, marcou "Outros" no chute e parou o protocolo para revisão
                humana por uma divergência que não existia.
              -->
              <td>111111111</td>
              <td>Dependente</td>
              <td>${comboControlado('selectParentesco0', [['2', 'Filho(a)'], ['17', 'Outros']], true)}</td>
              <td>${comboControlado('selectEstadoCivil0', [['1', 'Solteiro'], ['2', 'Casado']], true)}</td>
            </tr>
            <tr>
              <td>123.456.789-01</td>
              <td>Requerente</td>
              <td>${comboControlado('selectEstadoCivil1', [['1', 'Solteiro'], ['2', 'Casado']], true)}</td>
            </tr>
          </tbody></table>
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
        document.documentElement.dataset.geridRpaControlBridge = 'teste';
        (window as any).__geridReactMessages = [];
        (window as any).__geridReactDirectCalls = [];
        (window as any).__geridBridgeCalls = [];
        (window as any).chrome = {
          runtime: {
            sendMessage: async (mensagem: any) => {
              if (mensagem.action !== 'gerid_react_control') return undefined;
              (window as any).__geridReactMessages.push(mensagem);
              throw new Error('runtime indisponivel no contexto da pagina');
            },
          },
        };

        window.addEventListener('message', (evento) => {
          if (evento.source !== window || evento.data?.canal !== '__gerid_rpa_control__') return;
          if (evento.data?.tipoMensagem !== 'solicitacao') return;
          const detalhe = evento.data;
          (window as any).__geridBridgeCalls.push(detalhe);
          if (detalhe.tipoControle === 'combobox') {
            const combo = document.getElementById(detalhe.id) as HTMLInputElement | null;
            if (combo) combo.value = detalhe.valor;
          }
          if (detalhe.tipoControle === 'marcar') {
            const input = document.getElementById(detalhe.id) as HTMLInputElement | null;
            if (input) input.checked = true;
          }
          window.postMessage({
            canal: '__gerid_rpa_control__',
            tipoMensagem: 'resposta',
            requestId: detalhe.requestId,
            resposta: { ok: true },
          }, '*');
        });

        for (const combo of document.querySelectorAll<HTMLInputElement>('input[role="combobox"]')) {
          Object.defineProperty(combo, '__reactProps$teste', {
            enumerable: true,
            value: {
              onChange: (evento: { target: { value: string } }) => {
                const caixa = document.getElementById(`${combo.id}-itens`);
                const radio = Array.from(
                  caixa?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [],
                ).find((item) => item.value === evento.target.value);
                const item = radio?.closest<HTMLElement>('.br-item');
                const label = item?.querySelector<HTMLLabelElement>('label');
                const rotulo = label?.querySelector<HTMLElement>('[aria-hidden="true"] > div')
                  ?.textContent?.trim();
                if (rotulo) combo.value = rotulo;
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
                const input = controle.querySelector<HTMLInputElement>('input[type="checkbox"]');
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
              integrantes: [
                { cpf: '00111111111', parentesco: 'Filho(a)', estadoCivil: 'Solteiro' },
                { cpf: '12345678901', parentesco: 'Titular', estadoCivil: 'Casado' },
              ],
            },
          },
          configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
          anexos: [],
        }),
      );

      await pagina.waitForFunction(() => !document.querySelector<HTMLElement>('#passo5')?.hidden);
      // "Filho(a)" só sai daqui se a linha de 9 dígitos da tela tiver casado com
      // a de 11 da planilha. Sem casar, o parentesco fica vazio e o robô cai em
      // "Outros" — que é a opção ao lado, e estava passando por resposta.
      expect(await pagina.inputValue('#selectParentesco0')).toBe('Filho(a)');
      expect(await pagina.inputValue('#selectEstadoCivil0')).toBe('Solteiro');
      expect(await pagina.inputValue('#selectEstadoCivil1')).toBe('Casado');
      expect(await pagina.evaluate(() => (window as any).__geridReactDirectCalls)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tipo: 'combobox', id: 'idSelecionarServico' }),
          expect.objectContaining({ tipo: 'combobox', id: 'selectParentesco0' }),
          expect.objectContaining({ tipo: 'combobox', id: 'selectEstadoCivil0' }),
          expect.objectContaining({ tipo: 'combobox', id: 'selectEstadoCivil1' }),
          expect.objectContaining({ tipo: 'marcar', id: 'undefined-Nao' }),
        ]),
      );
      const chamadasPonte = await pagina.evaluate(() => (window as any).__geridBridgeCalls);
      expect(chamadasPonte).not.toContainEqual(
        expect.objectContaining({ tipoControle: 'combobox', id: 'selectEstadoCivil0' }),
      );
      expect(chamadasPonte).not.toContainEqual(
        expect.objectContaining({ tipoControle: 'marcar', id: 'undefined-Nao' }),
      );
      await execucao;
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 60_000);
});
