import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

describe('extensão Gerid — máquina de estados', () => {
  it('reconhece todas as telas suportadas e gera diagnóstico sem dados pessoais', async () => {
    const navegador = await chromium.launch({ headless: true });
    const pagina = await navegador.newPage();
    try {
      await pagina.addInitScript(() => {
        (window as any).chrome = { runtime: { sendMessage: async () => undefined } };
      });
      await pagina.setContent(`
        <main id="lista"><button>Novo Requerimento</button></main>
        <section id="pat" hidden><h1>LOGIN - PAT</h1><label>Abrangência</label></section>
        <section id="a3" hidden><p>Certificado digital do tipo A3</p><button>OK</button></section>
        <section id="p1" hidden><input id="idSelecionarServico"></section>
        <section id="p2" hidden><input id="idRequerente.cpf"></section>
        <section id="p3" hidden><input id="campo-autorizacaoCadunico" type="checkbox"></section>
        <section id="p4" hidden><h2>Grupo Familiar</h2><input id="selectEstadoCivil0"></section>
        <section id="p5" hidden><h2>Comprometimento de Renda</h2><input id="perguntaGastos-Nao"></section>
        <section id="p6" hidden><h2>Proteção Especial SUAS</h2><input id="perguntaSUAS-Nao"></section>
        <section id="p7" hidden>
          <input id="acompanharProcesso-Sim" type="checkbox">
          <div class="containerAnexo"><strong>Documento pessoal</strong><input type="file"></div>
          <div role="alert">CPF 123.456.789-01 e teste@example.com</div>
          <div id="contatos" role="dialog"><h1>Contatos</h1><button>Fechar</button></div>
        </section>
        <section id="p8" hidden><h2>Selecionar Unidade</h2><input placeholder="__.___-___"></section>
        <section id="p9" hidden><h2>Órgão Pagador</h2><input id="orgaoPagadorMunicipio"></section>
        <section id="p10" hidden>
          <h2>Confirmar</h2><input id="campo-declaracaoConfirmar" type="checkbox">
          <div id="confirmacao" role="dialog" hidden><h1>Atenção</h1><button>Confirmar</button></div>
        </section>
        <section id="comprovante" hidden><h2>Comprovante</h2><p>Protocolo do requerimento</p></section>
      `);

      const bundle = await readFile(path.join(process.cwd(), 'extensao-gerid', 'content.js'), 'utf8');
      await pagina.addScriptTag({ content: bundle });

      const cenarios: Array<[string, string]> = [
        ['lista', 'lista_requerimentos'],
        ['pat', 'autenticacao_pat'],
        ['a3', 'aviso_certificado_a3'],
        ['p1', 'passo_1'],
        ['p2', 'passo_2'],
        ['p3', 'passo_3'],
        ['p4', 'passo_4'],
        ['p5', 'passo_5'],
        ['p6', 'passo_6'],
        ['p7', 'passo_7'],
        ['p8', 'passo_8'],
        ['p9', 'passo_9'],
        ['p10', 'passo_10'],
        ['comprovante', 'comprovante'],
      ];

      for (const [id, esperado] of cenarios) {
        const estado = await pagina.evaluate((alvo) => {
          document.querySelectorAll<HTMLElement>('main, section').forEach((elemento) => {
            elemento.hidden = elemento.id !== alvo;
          });
          return (window as any).obterEstadoGerid();
        }, id);
        expect(estado.etapa, id).toBe(esperado);
      }

      const diagnostico = await pagina.evaluate(() => {
        document.querySelectorAll<HTMLElement>('main, section').forEach((elemento) => {
          elemento.hidden = elemento.id !== 'p7';
        });
        return (window as any).diagnosticarGerid();
      });
      expect(diagnostico).toMatchObject({ etapa: 'passo_7', modal: 'contatos' });
      expect(JSON.stringify(diagnostico)).not.toContain('123.456.789-01');
      expect(JSON.stringify(diagnostico)).not.toContain('teste@example.com');

      const pendencias = await pagina.evaluate(() => {
        const passo7 = document.querySelector<HTMLElement>('#p7');
        passo7?.insertAdjacentHTML(
          'beforeend',
          '<div>* Pergunta nova obrigatória?<input id="ca-nova" role="combobox"></div>',
        );
        return (window as any).obterPendenciasGerid();
      });
      expect(pendencias).toContain('Pergunta nova obrigatória?');

      const confirmacao = await pagina.evaluate(() => {
        document.querySelectorAll<HTMLElement>('main, section').forEach((elemento) => {
          elemento.hidden = elemento.id !== 'p10';
        });
        const modal = document.querySelector<HTMLElement>('#confirmacao');
        if (modal) modal.hidden = false;
        return (window as any).obterEstadoGerid();
      });
      expect(confirmacao).toEqual({ etapa: 'passo_10', modal: 'confirmacao_final' });
    } finally {
      await pagina.close();
      await navegador.close();
    }
  }, 30_000);
});
