import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

// ⚠️ O id do radio precisa ser único NO DOCUMENTO. Enquanto todos os combos
// emitiam `1`/`2`, clicar em `<label for="1">` acionava o primeiro radio "1" da
// página — de outro combo — e o valor não colava. O robô então gastava o
// segundo inteiro de espera antes de cair no `radio.check()` escopado, o que
// somava ~8s de tempo inventado ao passo 7. No GERID real os ids são únicos.
function combo(id: string, opcoes: string[]): string {
  return `
    <input id="${id}" role="combobox">
    <div id="${id}-itens">
      ${opcoes
        .map(
          (rotulo, i) =>
            `<label for="${id}-op${i + 1}">${rotulo}</label>` +
            `<input id="${id}-op${i + 1}" type="radio">`,
        )
        .join('')}
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
          <div id="contatos" role="dialog">
            <h1>Contatos</h1>
            ${combo('selectTipoContato', ['Celular', 'E-mail'])}
            <input id="valorContatoInteressado" placeholder="Informe o Celular">
            <button id="adicionar-contato">Adicionar</button>
            <table><tbody id="contatos-lista"></tbody></table>
            <button id="fechar-contatos">Fechar</button>
          </div>
          <span class="interaction-select"><input id="acompanharProcesso-Nao" type="checkbox"><label>Não</label></span>
          <span class="interaction-select"><input id="acompanharProcesso-Sim" type="checkbox"><label>Sim</label></span>
          <div id="div-ca-1">* Você é estrangeiro em situação regular no Brasil?${combo('ca-estrangeiro', ['A) Sim', 'B) Não'])}</div>
          <div id="div-ca-2">* Deseja cadastrar Representante Legal para este pedido?${combo('ca-representante', ['Sim', 'Não'])}</div>
          <div id="div-ca-3">* Deseja cadastrar Procurador para este pedido?${combo('ca-procurador', ['Sim', 'Não'])}</div>
          <div id="div-ca-4">* Comunicarei o óbito do titular/dependente.<input id="campo-ca-obito" type="checkbox"></div>
          <div id="div-ca-5">* CPF do Procurador<input id="ca-cpf-procurador"></div>
          <div id="div-ca-6">* Onde você mora?${combo('ca-moradia', ['Moro em residência', 'Situação de Rua'])}</div>
          <div id="div-ca-7">* Forma de Convívio${combo('ca-convivio', ['Sozinho(a)', 'Com pessoas da família'])}</div>
          <div id="div-ca-8">* Recebe algum tipo de benefício?${combo('ca-beneficio', ['A) Sim, do INSS', 'C) Não'])}</div>
          <div id="div-ca-9">* Se recebe Bolsa Família e é o responsável familiar no CadÚnico, autoriza o INSS a enviar o desligamento voluntário do bolsa família, caso o BPC seja aprovado?${combo('ca-bolsa', ['Sim', 'Não há recebimento de Bolsa Família'])}</div>
          <div id="div-ca-10">* Caso não possua os requisitos ao benefício na data de hoje, autoriza o INSS a alterar a data do pedido para atender às condições para o benefício?${combo('ca-data', ['Sim', 'Não'])}</div>
          <div id="div-ca-11">* Estou ciente de que devo acompanhar o pedido pelos canais de atendimento.<input id="campo-ca-ciencia" type="checkbox"></div>
          <div class="componenteAnexos">${slots.map((slot) => `<div class="containerAnexo"><strong>${slot}</strong><input id="single-file" type="file"></div>`).join('')}</div>
        </section>
        <section id="passo8" hidden>
          <h2>Selecionar Unidade</h2><span>Consultar por CEP</span>
          <label>Campo auxiliar sem relacao com o CEP</label>
          <input placeholder="__.___-___"><button>Buscar</button>
          <div class="unidade" tabindex="0"><div class="nome">AGÊNCIA REGIONAL UM</div><div class="municipio">CIDADE VIZINHA-SE</div></div>
          <div class="unidade" tabindex="0"><div class="nome">AGÊNCIA REGIONAL DOIS</div><div class="municipio">OUTRA CIDADE-SE</div></div>
        </section>
        <section id="passo9" hidden>
          <h2>Órgão Pagador</h2><p>Selecione o local em que deseja receber o benefício.</p>
          ${combo('orgaoPagadorMunicipio', ['CIDADE TESTE'])}
          <style>#orgao-1 { display: none; }</style>
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
                document.querySelector('#valorContatoInteressado').placeholder = 'Informe o ' + (input.value || 'tipo de contato');
              }
            });
          }
          for (const tag of document.querySelectorAll('.interaction-select')) {
            tag.addEventListener('click', () => { tag.querySelector('input').checked = true; });
          }
          // Quando o GERID ACEITA um anexo, a própria caixa passa a listar o nome
          // do arquivo e a oferecer um controle de Excluir. É esse sinal que o robô
          // confere antes de dar o anexo por entregue (build .10 perdeu documento
          // justamente por confiar só no que ele mesmo tinha escrito no input).
          // Sem reproduzir isso aqui, o teste mediria um GERID que não existe.
          for (const caixaAnexo of document.querySelectorAll('.containerAnexo')) {
            const entrada = caixaAnexo.querySelector('input[type="file"]');
            entrada.addEventListener('change', () => {
              for (const antigo of caixaAnexo.querySelectorAll('.anexo-aceito')) antigo.remove();
              for (const arquivo of entrada.files ?? []) {
                caixaAnexo.insertAdjacentHTML(
                  'beforeend',
                  '<div class="anexo-aceito"><span>' + arquivo.name + '</span>' +
                  '<button type="button" aria-label="Excluir anexo">Excluir</button></div>',
                );
              }
            });
          }
          for (const unidade of document.querySelectorAll('.unidade')) {
            unidade.addEventListener('click', () => {
              document.querySelectorAll('.unidade').forEach((u) => u.classList.remove('selected'));
              unidade.classList.add('selected');
            });
          }
          document.querySelector('#consultar').addEventListener('click', () => { document.querySelector('#nomeRequerente').value = 'Pessoa de Teste'; });
          document.querySelector('#editar-contatos').addEventListener('click', () => { document.querySelector('#contatos').hidden = false; });
          document.querySelector('#fechar-contatos').addEventListener('click', () => { document.querySelector('#contatos').hidden = true; });
          document.querySelector('#adicionar-contato').addEventListener('click', () => {
            const contato = { tipo: document.querySelector('#selectTipoContato').value, valor: document.querySelector('#valorContatoInteressado').value };
            window.__contatos.push(contato);
            document.querySelector('#contatos-lista').insertAdjacentHTML('beforeend', '<tr><td>' + contato.tipo + '</td><td>' + contato.valor + '</td></tr>');
            document.querySelector('#editar-contatos').textContent = 'Contatos cadastrados';
            document.querySelector('#selectTipoContato').value = '';
            document.querySelector('#valorContatoInteressado').value = '';
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
              if (passos[atual + 1].id === 'passo7') document.querySelector('#contatos').hidden = false;
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

      // Guarda de tempo. Ela mede só as etapas 1–9, que esta página falsa
      // simula por inteiro. A etapa 10 fica DE FORA porque o mock não tem o
      // modal de confirmação do GERID — ela consome sempre os 20s de espera por
      // ele, e somá-los tornaria o número insensível a regressão de verdade.
      // Medido hoje: ~10s no total, com ~8s no passo 7. O teto existe para
      // pegar espera cega voltando (o passo 7 já chegou a 28s por causa de
      // seletor que não casava e caía no plano B só depois do timeout).
      const etapas: Array<{ etapa: string; duracaoMs: number }> = resultado.metricas.etapas;
      const ateNove = etapas.filter((item) => !item.etapa.startsWith('10'));
      const somaAteNove = ateNove.reduce((total, item) => total + item.duracaoMs, 0);
      expect(
        somaAteNove,
        `Etapas 1-9 levaram ${somaAteNove}ms. ${JSON.stringify(etapas)}`,
      ).toBeLessThan(15_000);

      await pagina.waitForFunction(
        () => !document.querySelector<HTMLElement>('#passo10')?.hidden,
        undefined,
        { timeout: 20_000 },
      );

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
