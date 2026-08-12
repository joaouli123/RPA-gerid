import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

/**
 * Depois de confirmar o aviso de biometria o GERID NÃO abre o comprovante: ele
 * recarrega o navegador direto em `/tarefas/detalhar_tarefa/<protocolo>`.
 *
 * Duas coisas precisam funcionar nessa tela, e as duas erram caro:
 *
 * 1. Ler o protocolo do campo certo. A mesma tela tem "Unidade de Protocolo",
 *    cujo valor é o nome de uma agência — casar rótulo por `includes` leria
 *    texto no lugar do número.
 * 2. Não confirmar o modal errado. O aviso de biometria tem só "Confirmar" e
 *    precisa ser confirmado; o "Você criou uma tarefa… deseja visualizar?" tem
 *    "Fechar" ao lado, e confirmar ALI abandona o requerimento preenchido.
 *
 * ⚠️ Todo dado aqui é FICTÍCIO. A tela real de onde veio a estrutura tinha CPF
 * e nome de uma pessoa com deficiência de verdade — isso não entra no repo.
 */
const TELA_DETALHE = `
  <main id="tarefas-container">
    <div class="dtp-datagrid-item">
      <label class="dtp-datagrid-label">Protocolo</label>
      <span class="dtp-datagrid-value">900000001</span>
    </div>
    <div class="dtp-datagrid-item">
      <label class="dtp-datagrid-label">Protocolado em</label>
      <span class="dtp-datagrid-value">12/08/2026</span>
    </div>
    <div class="dtp-datagrid-item">
      <label class="dtp-datagrid-label">Unidade de Protocolo</label>
      <span class="dtp-datagrid-value">APS CIDADE EXEMPLO - CENTRO</span>
    </div>
    <div class="dtp-datagrid-item">
      <label class="dtp-datagrid-label">Requerente</label>
      <span class="dtp-datagrid-value">FULANO DE EXEMPLO DA SILVA</span>
    </div>
    <div style="display: flex; justify-content: center;">
      <button class="dtp-btn dtp-primary" id="btn-dt-gerar-comprovante">Gerar Comprovante</button>
      <button class="dtp-btn dtp-primary" id="btn-dt-cancelar-tarefa">Cancelar Requerimento</button>
    </div>
  </main>
`;

type LeituraDaTela = { protocolo: string; protocoladoEm: string };
type DecisaoDeModal = { tipo: string; texto: string; algumDialogo: boolean };

async function comAPagina<T>(html: string, acao: (pagina: any) => Promise<unknown>): Promise<T> {
  const navegador = await chromium.launch({ headless: true });
  const pagina = await navegador.newPage();
  try {
    await pagina.addInitScript(() => {
      (window as any).chrome = { runtime: { sendMessage: async () => undefined } };
    });
    await pagina.setContent(html);
    const bundle = await readFile(path.join(process.cwd(), 'extensao-gerid', 'content.js'), 'utf8');
    await pagina.addScriptTag({ content: bundle });
    return (await acao(pagina)) as T;
  } finally {
    await pagina.close();
    await navegador.close();
  }
}

describe('tela de detalhe da tarefa', () => {
  it('lê o protocolo do campo rotulado e a data junto', async () => {
    const lido = await comAPagina<LeituraDaTela>(TELA_DETALHE, (pagina) =>
      pagina.evaluate(() => (window as any).protocoloDaTarefaNaTela()));

    expect(lido).toEqual({ protocolo: '900000001', protocoladoEm: '12/08/2026' });
  });

  it('não confunde "Unidade de Protocolo" com "Protocolo"', async () => {
    // Se o rótulo casasse por `includes`, esta tela — onde o campo Protocolo
    // não existe — devolveria o nome da agência como se fosse o número.
    const semProtocolo = TELA_DETALHE.replace(
      '<label class="dtp-datagrid-label">Protocolo</label>',
      '<label class="dtp-datagrid-label">Situação</label>',
    );
    const lido = await comAPagina<LeituraDaTela>(semProtocolo, (pagina) =>
      pagina.evaluate(() => (window as any).protocoloDaTarefaNaTela()));

    expect(lido.protocolo).toBe('');
  });

  it('fora da tela de detalhe não lê nada', async () => {
    // A lista de tarefas mostra protocolo de MUITA gente. Sem o `#tarefas-container`
    // a leitura tem que devolver vazio, senão o robô registra número de terceiro.
    const lido = await comAPagina<LeituraDaTela>('<main id="lista"><td>900000002</td></main>', (pagina) =>
      pagina.evaluate(() => (window as any).protocoloDaTarefaNaTela()));

    expect(lido).toEqual({ protocolo: '', protocoladoEm: '' });
  });
});

describe('decisão sobre os modais do envio', () => {
  const modal = (corpo: string, botoes: string) => `
    <div class="br-modal" role="dialog">
      <div class="br-modal-header"><h1 class="br-modal-title">Aviso</h1></div>
      <div class="br-modal-body"><p>${corpo}</p></div>
      <div class="br-modal-footer">${botoes}</div>
    </div>`;

  const decidir = (html: string) =>
    comAPagina<DecisaoDeModal>(html, (pagina) =>
      pagina.evaluate(() => (window as any).decidirModalDoEnvioGerid()));

  it('confirma o aviso de biometria, que tem um único botão', async () => {
    const decisao = await decidir(modal(
      'O pedido ainda não está concluído. É necessário realizar o cadastro biométrico ' +
      'do interessado para a conclusão do pedido.',
      '<button class="br-button primary" type="button">Confirmar</button>',
    ));

    expect(decisao.tipo).toBe('ciente');
    // O texto sobe junto: é uma exigência de 30 dias que alguém vai ter que
    // cumprir, então confirmar o ciente não pode apagar a frase.
    expect(decisao.texto).toContain('cadastro biométrico');
  });

  it('NÃO confirma o "deseja visualizar esta tarefa?", que tem Fechar ao lado', async () => {
    // Este é o modal caro: confirmar aqui abandona o requerimento que o robô
    // acabou de preencher inteiro e navega para outra tarefa.
    const decisao = await decidir(modal(
      'Você criou uma tarefa, protocolo 900000003, para este interessado recentemente. ' +
      'Deseja visualizar esta tarefa?',
      '<button type="button">Fechar</button><button type="button">Confirmar</button>',
    ));

    expect(decisao.tipo).toBe('');
    expect(decisao.algumDialogo).toBe(true);
  });

  it('reconhece a confirmação final "Atenção" pelo par Cancelar/Confirmar', async () => {
    const decisao = await decidir(`
      <div role="dialog">
        <h1>Atenção</h1><p>Confirma o envio do requerimento?</p>
        <button type="button">Cancelar</button><button type="button">Confirmar</button>
      </div>`);

    expect(decisao.tipo).toBe('atencao');
  });

  it('botão de fechar só com ícone não conta como escolha', async () => {
    // O GERID põe um "X" sem rótulo no canto de vários modais. Se ele contasse
    // como alternativa, o aviso de botão único deixaria de ser reconhecido e o
    // envio travaria de novo — foi assim que o de biometria parou o robô.
    const decisao = await decidir(modal(
      'Aviso novo que o INSS ainda vai inventar.',
      '<button type="button" aria-label="Fechar"><i class="fas fa-times"></i></button>' +
      '<button type="button">Confirmar</button>',
    ));

    expect(decisao.tipo).toBe('ciente');
  });

  it('sem modal na tela não decide nada', async () => {
    const decisao = await decidir(TELA_DETALHE);
    expect(decisao).toEqual({ tipo: '', texto: '', algumDialogo: false });
  });
});

describe('background: a troca de tela não pode virar retentativa', () => {
  const fonte = async () =>
    readFile(path.join(process.cwd(), 'extensao-gerid', 'background.js'), 'utf8');

  it('pergunta onde o navegador parou ANTES de refazer o caso', async () => {
    const texto = await fonte();

    // "A pagina recarregou" e "o requerimento ENTROU e o GERID mudou de tela"
    // dão o mesmo erro. Se a retentativa vier primeiro, o robô abre um SEGUNDO
    // pedido para a mesma pessoa — exatamente o que a trava de dedupe existe
    // para impedir. Por isso a checagem tem que preceder cada `continue`.
    const caminhos = [...texto.matchAll(/erroDeNavegacao\([^)]*\)\) \{/g)];
    expect(caminhos.length).toBe(2);

    for (const caminho of caminhos) {
      const inicio = caminho.index ?? 0;
      const bloco = texto.slice(inicio, texto.indexOf('continue;', inicio));
      expect(bloco).toContain('protocoloDepoisDeNavegar');
      expect(bloco).toContain('if (jaEntrou) return jaEntrou;');
    }
  });

  it('o comprovante da tela de detalhe é pedido pelo id exato do botão', async () => {
    const texto = await fonte();

    // ⚠️ "Cancelar Requerimento" fica ao LADO de "Gerar Comprovante", com a
    // mesma classe. Buscar por texto, por classe ou por posição erraria de
    // apagar o pedido que acabou de entrar.
    expect(texto).toContain("document.querySelector('#btn-dt-gerar-comprovante')");
    expect(texto).not.toContain('btn-dt-cancelar-tarefa');
  });

  it('divergência de protocolo não baixa comprovante nenhum', async () => {
    const texto = await fonte();
    const inicio = texto.indexOf('async function comprovantePelaTelaDeDetalhe');
    expect(inicio).toBeGreaterThan(-1);

    // Ler um número no preenchimento e OUTRO na tela de detalhe significa que
    // não se sabe qual é o requerimento certo. Escolher um é arquivar
    // comprovante de terceiro na pasta do cliente: o robô para e chama gente.
    const corpo = texto.slice(inicio, texto.indexOf('\n}\n', inicio));
    const divergencia = corpo.indexOf('ATENCAO: li');
    expect(divergencia).toBeGreaterThan(-1);
    // O primeiro `return` depois do aviso tem que ser a desistência.
    const depois = corpo.slice(divergencia);
    expect(depois.slice(depois.indexOf('return '))).toMatch(/^return false;/);
  });
});
