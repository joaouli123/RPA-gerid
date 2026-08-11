import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

function combo(id: string, opcoes: string[]): string {
  return `
    <input id="${id}" role="combobox">
    <div id="${id}-itens">
      ${opcoes.map((rotulo, i) => `<label for="${i + 1}">${rotulo}</label><input id="${i + 1}" type="radio">`).join('')}
    </div>`;
}

const slots = [
  'Termo de representação da entidade conveniada',
  'Documento de identificação do procurador (OAB/RG/CNH/CTPS)',
  'Comprovante da representação legal, se for o caso',
  'Documentos de identificação do representante legal, se for o caso',
  'Documentos de identificação do interessado',
  'Documento de identificação de todos os membros do grupo familiar',
  'Comprovantes das relações previdenciárias do interessado e do grupo familiar',
  'Outros documentos',
  'Documento Médico',
  'Comprovante do cadastro biométrico do titular',
  'Comprovante do cadastro biométrico do representante legal',
];

describe('extensão Gerid — dados, contatos e anexos', () => {
  it('preenche os dois contatos, acompanhamento, procurador e caixas corretas', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        (window as any).chrome = { runtime: { sendMessage: async () => undefined } };
      });

      await pagina.setContent(`
        <section id="passo1"><h2>Seleção de Serviços</h2><input id="idSelecionarServico"><button aria-label="Exibir lista">Exibir lista</button><div id="idSelecionarServico-itens"><label for="1655">Benefício Assistencial à Pessoa com Deficiência</label><input id="1655" type="radio"></div></section>
        <section id="passo2" hidden><h2>Informar Requerente</h2><input id="idRequerente.cpf"><button id="consultar" aria-label="Botão de ação">Consultar</button><input id="nomeRequerente"></section>
        <section id="passo3" hidden><h2>Autorização CadÚnico</h2><input id="campo-autorizacaoCadunico" type="checkbox"></section>
        <section id="passo4" hidden>
          <h2>Grupo Familiar</h2>
          <table><tbody><tr><td>123.456.789-01</td><td>Requerente</td><td>${combo('selectEstadoCivil0', ['Solteiro', 'Casado'])}</td></tr></tbody></table>
          <span class="interaction-select"><input id="undefined-Nao" type="checkbox"><label>Não</label></span>
        </section>
        <section id="passo5" hidden><h2>Comprometimento de Renda</h2><span class="interaction-select"><input id="perguntaGastos-Nao" type="checkbox"><label>Não</label></span></section>
        <section id="passo6" hidden><h2>Proteção Especial SUAS</h2><span class="interaction-select"><input id="perguntaSUAS-Nao" type="checkbox"><label>Não</label></span></section>
        <section id="passo7" hidden>
          <h2>Interessados</h2><h3>Dados Adicionais</h3>
          <button id="editar-contatos" aria-label="Clique para editar contatos do interessado">Adicionar</button>
          <div id="dialog-contatos" role="dialog">
            <h1>Contatos</h1>
            ${combo('selectTipoContato', ['Celular', 'E-mail'])}
            <input id="valor-contato" placeholder="Informe o Celular">
            <button id="adicionar-contato">Adicionar</button>
            <table><tbody id="contatos-lista"></tbody></table>
            <button id="fechar-contatos">Fechar</button>
          </div>
          <span class="interaction-select"><input id="acompanharProcesso-Nao" type="checkbox"><label>Não</label></span>
          <span class="interaction-select"><input id="acompanharProcesso-Sim" type="checkbox"><label>Sim</label></span>
          <div>* Você é estrangeiro em situação regular no Brasil?${combo('ca-estrangeiro', ['A) Sim', 'B) Não'])}</div>
          <div>* Deseja cadastrar Representante Legal para este pedido?${combo('ca-representante', ['Sim', 'Não'])}</div>
          <div>* Deseja cadastrar Procurador para este pedido?${combo('ca-procurador', ['Sim', 'Não'])}</div>
          <div>* Comunicarei o óbito do titular/dependente.<input id="campo-ca-obito" type="checkbox"></div>
          <div>* CPF do Procurador<input id="ca-cpf-procurador"></div>
          <div>* Onde você mora?${combo('ca-moradia', ['Moro em residência', 'Situação de Rua'])}</div>
          <div>* Forma de Convívio${combo('ca-convivio', ['Sozinho(a)', 'Com pessoas da família'])}</div>
          <div>* Recebe algum tipo de benefício?${combo('ca-beneficio', ['A) Sim, do INSS', 'C) Não'])}</div>
          <div>* Se recebe Bolsa Família e é o responsável familiar no CadÚnico, autoriza o INSS a enviar o desligamento voluntário do bolsa família, caso o BPC seja aprovado?${combo('ca-bolsa', ['Sim', 'Não há recebimento de Bolsa Família'])}</div>
          <div>* Caso não possua os requisitos ao benefício na data de hoje, autoriza o INSS a alterar a data do pedido para atender às condições para o benefício?${combo('ca-data', ['Sim', 'Não'])}</div>
          <div>* Estou ciente de que devo acompanhar o pedido pelos canais de atendimento.<input id="campo-ca-ciencia" type="checkbox"></div>
          <div class="componenteAnexos">${slots.map((slot) => `<div class="containerAnexo"><strong>${slot}</strong><input id="single-file" type="file"></div>`).join('')}</div>
        </section>
        <section id="passo8" hidden>
          <h2>Selecionar Unidade</h2><span>Consultar por CEP</span>
          <input placeholder="__.___-___"><button>Buscar</button>
          <div class="unidade" tabindex="0"><div class="nome">AGÊNCIA REGIONAL UM</div><div class="municipio">CIDADE VIZINHA-SE</div></div>
          <div class="unidade" tabindex="0"><div class="nome">AGÊNCIA REGIONAL DOIS</div><div class="municipio">OUTRA CIDADE-SE</div></div>
        </section>
        <section id="passo9" hidden>
          <h2>Órgão Pagador</h2><p>Selecione o local em que deseja receber o benefício.</p>
          ${combo('orgaoPagadorMunicipio', ['CIDADE TESTE'])}
          <table><tbody><tr><td><input id="orgao-1" type="radio" name="orgao"></td><td>ÓRGÃO PAGADOR TESTE</td><td>RUA DE TESTE</td><td>CENTRO</td></tr></tbody></table>
        </section>
        <section id="passo10" hidden><h2>Confirmar</h2><label>Declaro que li e concordo<input id="campo-declaracaoConfirmar" type="checkbox"></label></section>
        <button id="btn-next">Avançar</button>
        <script>
          window.__contatos = [];
          for (const radio of document.querySelectorAll('input[type="radio"]')) {
            radio.addEventListener('click', () => {
              const caixa = radio.parentElement;
              if (!caixa?.id.endsWith('-itens')) return;
              const idCombo = caixa.id.slice(0, -6);
              const input = document.getElementById(idCombo);
              const label = caixa.querySelector('label[for="' + radio.id + '"]');
              if (input) input.value = label?.textContent || '';
              if (idCombo === 'selectTipoContato') {
                document.querySelector('#valor-contato').placeholder = 'Informe o ' + (input.value || 'tipo de contato');
              }
            });
          }
          for (const tag of document.querySelectorAll('.interaction-select')) {
            tag.addEventListener('click', () => { tag.querySelector('input').checked = true; });
          }
          for (const unidade of document.querySelectorAll('.unidade')) {
            unidade.addEventListener('click', () => {
              document.querySelectorAll('.unidade').forEach((u) => u.classList.remove('selected'));
              unidade.classList.add('selected');
            });
          }
          document.querySelector('#consultar').addEventListener('click', () => { document.querySelector('#nomeRequerente').value = 'Pessoa de Teste'; });
          document.querySelector('#editar-contatos').addEventListener('click', () => { document.querySelector('#dialog-contatos').hidden = false; });
          document.querySelector('#fechar-contatos').addEventListener('click', () => { document.querySelector('#dialog-contatos').hidden = true; });
          document.querySelector('#adicionar-contato').addEventListener('click', () => {
            const contato = { tipo: document.querySelector('#selectTipoContato').value, valor: document.querySelector('#valor-contato').value };
            window.__contatos.push(contato);
            document.querySelector('#contatos-lista').insertAdjacentHTML('beforeend', '<tr><td>' + contato.tipo + '</td><td>' + contato.valor + '</td></tr>');
            document.querySelector('#editar-contatos').textContent = 'Contatos cadastrados';
            document.querySelector('#selectTipoContato').value = '';
            document.querySelector('#valor-contato').value = '';
          });
          document.querySelector('#btn-next').addEventListener('click', () => {
            const passos = [...document.querySelectorAll('section')];
            const atual = passos.findIndex((p) => !p.hidden);
            const passoAtual = passos[atual];
            if (passoAtual?.id === 'passo4' &&
                (!document.querySelector('#selectEstadoCivil0').value || !document.querySelector('#undefined-Nao').checked)) return;
            if (passoAtual?.id === 'passo5' && !document.querySelector('#perguntaGastos-Nao').checked) return;
            if (passoAtual?.id === 'passo6' && !document.querySelector('#perguntaSUAS-Nao').checked) return;
            if (atual >= 0 && atual < passos.length - 1) {
              passos[atual].hidden = true;
              passos[atual + 1].hidden = false;
              if (passos[atual + 1].id === 'passo7') document.querySelector('#dialog-contatos').hidden = false;
            }
          });
        </script>
      `);

      const bundle = await readFile(path.join(process.cwd(), 'extensao-gerid', 'content.js'), 'utf8');
      await pagina.addScriptTag({ content: bundle });
      const caso = {
          nome: 'Pessoa de Teste',
          dados: {
            cliente: { cpf: '12345678901', nome: 'Pessoa de Teste', cep: '12345678', cidade: 'Cidade Teste/SE', telefone: '62999999999' },
            grupoFamiliar: { requerenteCpf: '12345678901', integrantes: [{ cpf: '12345678901', parentesco: 'Titular' }] },
          },
          configuracao: { procuradorCpf: '04794750161', telefonePadrao: '62999999999', emailEscritorio: 'teste@example.com' },
          anexos: [
            { tipo: 'TERMO_REPRESENTACAO', nome: 'termo.pdf', mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' },
            { tipo: 'DOCUMENTOS_PESSOAIS', nome: 'documentos.pdf', mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' },
            { tipo: 'DOCUMENTOS_PESSOAIS', nome: 'documentos-2.pdf', mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' },
          ],
        };
      const resultado = await pagina.evaluate((entrada) =>
        (window as any).iniciarProcessamento(entrada), caso,
      );
      expect(resultado, JSON.stringify(resultado)).toMatchObject({ status: 'revisao' });

      await pagina.waitForFunction(() => {
        const contatos = (window as any).__contatos;
        const arquivos = [...document.querySelectorAll<HTMLInputElement>('.containerAnexo input[type="file"]')];
        return contatos.length === 2 &&
          contatos[0].tipo === 'Celular' && contatos[1].tipo === 'E-mail' &&
          document.querySelector<HTMLInputElement>('#acompanharProcesso-Sim')?.checked &&
          document.querySelector<HTMLInputElement>('#ca-cpf-procurador')?.value === '04794750161' &&
          document.querySelector<HTMLInputElement>('#campo-ca-obito')?.checked &&
          document.querySelector<HTMLInputElement>('#campo-ca-ciencia')?.checked &&
          arquivos[0]?.files?.[0]?.name === 'termo.pdf' &&
          arquivos[4]?.files?.length === 2 &&
          arquivos[4]?.files?.[0]?.name === 'documentos.pdf' &&
          arquivos[4]?.files?.[1]?.name === 'documentos-2.pdf' &&
          document.querySelector<HTMLElement>('.unidade')?.classList.contains('selected') &&
          document.querySelector<HTMLInputElement>('#orgaoPagadorMunicipio')?.value === 'CIDADE TESTE' &&
          document.querySelector<HTMLInputElement>('#orgao-1')?.checked &&
          !document.querySelector<HTMLElement>('#passo10')?.hidden;
      }, undefined, { timeout: 20_000 });

      const estado = await pagina.evaluate(() => ({
        contatos: (window as any).__contatos,
        acompanha: document.querySelector<HTMLInputElement>('#acompanharProcesso-Sim')?.checked,
        procurador: document.querySelector<HTMLInputElement>('#ca-cpf-procurador')?.value,
        arquivos: [...document.querySelectorAll<HTMLInputElement>('.containerAnexo input[type="file"]')]
          .map((i) => [...(i.files ?? [])].map((arquivo) => arquivo.name)),
        unidade: document.querySelector<HTMLElement>('.unidade.selected .nome')?.innerText,
        municipio: document.querySelector<HTMLInputElement>('#orgaoPagadorMunicipio')?.value,
        orgao: document.querySelector<HTMLInputElement>('#orgao-1')?.checked,
        revisao: !document.querySelector<HTMLElement>('#passo10')?.hidden,
      }));
      expect(estado.contatos).toEqual([
        { tipo: 'Celular', valor: '62999999999' },
        { tipo: 'E-mail', valor: 'teste@example.com' },
      ]);
      expect(estado.acompanha).toBe(true);
      expect(estado.procurador).toBe('04794750161');
      expect(estado.arquivos[0]).toEqual(['termo.pdf']);
      expect(estado.arquivos[4]).toEqual(['documentos.pdf', 'documentos-2.pdf']);
      expect(estado.arquivos[10]).toEqual([]);
      expect(estado.unidade).toBe('AGÊNCIA REGIONAL UM');
      expect(estado.municipio).toBe('CIDADE TESTE');
      expect(estado.orgao).toBe(true);
      expect(estado.revisao).toBe(true);
      expect(resultado).toMatchObject({ status: 'revisao' });

      // Regressão: uma falha de validação no último Avançar não pode ser
      // reportada como revisão concluída. O robô só está pronto quando a tela
      // Confirmar realmente apareceu.
      await pagina.evaluate(() => {
        document.querySelector('#passo10')?.remove();
        document.querySelectorAll<HTMLElement>('section').forEach((passo) => { passo.hidden = true; });
        const primeiro = document.querySelector<HTMLElement>('#passo1');
        if (primeiro) primeiro.hidden = false;
      });
      const semTelaFinal = await pagina.evaluate((entrada) =>
        (window as any).iniciarProcessamento(entrada), caso,
      );
      expect(semTelaFinal).toMatchObject({ status: 'erro' });
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 80_000);
});
