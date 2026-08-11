import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

function combo(id: string, opcoes: Array<[string, string]>): string {
  return `
    <input id="${id}" role="combobox">
    <div id="${id}-itens">
      ${opcoes
        .map(([valor, rotulo]) => `<label for="${valor}">${rotulo}</label><input id="${valor}" type="radio" value="${valor}">`)
        .join('')}
    </div>`;
}

const parentescos: Array<[string, string]> = [
  ['4', 'Irmão / Irmã'],
  ['3', 'Pai / Mãe / Padrasto / Madrasta'],
  ['17', 'Outros'],
];

const estados: Array<[string, string]> = [
  ['1', 'Solteiro'],
  ['2', 'Casado'],
];

describe('extensão Gerid — grupo familiar real', () => {
  it('identifica o requerente fora da primeira linha e recupera CPF com zero inicial', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        (window as any).chrome = { runtime: { sendMessage: async () => undefined } };
      });

      await pagina.setContent(`
        <section id="passo1">
          <h2>Seleção de Serviços</h2>
          <input id="idSelecionarServico" role="combobox">
          <button aria-label="Exibir lista">Exibir lista</button>
          <div id="idSelecionarServico-itens">
            <label for="1655">Benefício Assistencial à Pessoa com Deficiência</label>
            <input id="1655" type="radio" value="1655">
          </div>
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
          <table><tbody id="linhas-grupo-familiar">
            <tr><td>987.654.321-09</td><td>${combo('selectParentesco0', parentescos)}</td><td>${combo('selectEstadoCivil0', estados)}</td></tr>
            <tr><td>876.543.210-98</td><td>${combo('selectParentesco1', parentescos)}</td><td>${combo('selectEstadoCivil1', estados)}</td></tr>
            <tr><td>123.456.789-0</td><td>${combo('selectParentesco2', parentescos)}</td><td>${combo('selectEstadoCivil2', estados)}</td></tr>
            <tr><td>123.456.789-01</td><td>Requerente</td><td>${combo('selectEstadoCivil3', estados)}</td></tr>
          </tbody></table>
          <span class="interaction-select"><input id="undefined-Nao" type="checkbox"><label>Não</label></span>
          <span class="interaction-select"><input id="undefined-Sim" type="checkbox"><label>Sim</label></span>
        </section>
        <section id="passo5" hidden>
          <h2>Comprometimento de Renda</h2>
          <span class="interaction-select"><input id="perguntaGastos-Nao" type="checkbox"><label>Não</label></span>
        </section>
        <section id="passo6" hidden>
          <h2>Proteção Especial SUAS</h2>
          <span class="interaction-select"><input id="perguntaSUAS-Nao" type="checkbox"><label>Não</label></span>
        </section>
        <button id="btn-next">Avançar</button>
        <script>
          function ativarComboboxes(raiz) {
            for (const label of raiz.querySelectorAll('[id$="-itens"] label')) {
              label.addEventListener('click', () => {
                const caixa = label.closest('[id$="-itens"]');
                const combo = document.getElementById(caixa.id.slice(0, -6));
                if (combo) combo.value = label.textContent?.trim() || '';
              });
            }
          }
          ativarComboboxes(document);
          const corpoGrupo = document.querySelector('#linhas-grupo-familiar');
          const linhasGrupoAtrasadas = Array.from(corpoGrupo.children);
          linhasGrupoAtrasadas.forEach((linha) => linha.remove());
          for (const tag of document.querySelectorAll('.interaction-select')) {
            tag.addEventListener('click', () => {
              const input = tag.querySelector('input');
              input.checked = true;
            });
          }
          document.querySelector('[aria-label="Exibir lista"]').addEventListener('click', () => {});
          document.querySelector('#consultar').addEventListener('click', () => {
            document.querySelector('#nomeRequerente').value = 'Pessoa de Teste';
          });
          document.querySelector('#btn-next').addEventListener('click', () => {
            const passos = [...document.querySelectorAll('section')];
            const atual = passos.findIndex((p) => !p.hidden);
            if (atual >= 0 && atual < passos.length - 1) {
              passos[atual].hidden = true;
              passos[atual + 1].hidden = false;
              if (passos[atual + 1].id === 'passo4') {
                setTimeout(() => corpoGrupo.append(...linhasGrupoAtrasadas), 150);
              }
            }
          });
        </script>
      `);

      const bundle = await readFile(path.join(process.cwd(), 'extensao-gerid', 'content.js'), 'utf8');
      await pagina.addScriptTag({ content: bundle });
      await pagina.evaluate(() => {
        (window as any).iniciarProcessamento({
          nome: 'Pessoa de Teste',
          dados: {
            cliente: { cpf: '12345678901', nome: 'Pessoa de Teste' },
            grupoFamiliar: {
              requerenteCpf: '12345678901',
              integrantes: [
                { cpf: '12345678901', parentesco: 'Titular', estadoCivil: 'casado' },
                { cpf: '01234567890', parentesco: 'Mãe', estadoCivil: 'solteiro' },
                { cpf: '98765432109', parentesco: 'Irmã', estadoCivil: 'casado' },
                { cpf: '87654321098', parentesco: 'Irmão', estadoCivil: 'solteiro' },
              ],
            },
          },
          configuracao: {
            procuradorCpf: '00000000000',
            telefonePadrao: '',
            emailEscritorio: '',
          },
          anexos: [],
        });
      });

      await pagina.waitForFunction(() =>
        (document.querySelector<HTMLInputElement>('#selectParentesco0')?.value === 'Irmão / Irmã') &&
        (document.querySelector<HTMLInputElement>('#selectParentesco1')?.value === 'Irmão / Irmã') &&
        (document.querySelector<HTMLInputElement>('#selectParentesco2')?.value === 'Pai / Mãe / Padrasto / Madrasta') &&
        document.querySelector<HTMLInputElement>('#selectEstadoCivil0')?.value === 'Casado' &&
        document.querySelector<HTMLInputElement>('#selectEstadoCivil1')?.value === 'Solteiro' &&
        document.querySelector<HTMLInputElement>('#selectEstadoCivil2')?.value === 'Solteiro' &&
        document.querySelector<HTMLInputElement>('#selectEstadoCivil3')?.value === 'Casado' &&
        document.querySelector<HTMLInputElement>('#undefined-Nao')?.checked,
      );

      expect(await pagina.locator('#selectParentesco3').count()).toBe(0);
      expect(await pagina.inputValue('#selectParentesco2')).toBe('Pai / Mãe / Padrasto / Madrasta');
      expect(await pagina.isChecked('#undefined-Nao')).toBe(true);
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 30_000);
});
