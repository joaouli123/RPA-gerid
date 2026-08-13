import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O CAS do GERID atende em `geridinss.dataprev.gov.br:8443`.
 *
 * A extensão classificava a aba com `url.includes('://geridinss.dataprev.gov.br/')`,
 * que é FALSO quando há porta explícita — a url tem `...gov.br:8443/`. O efeito
 * era mudo: a tela de login virava SEM_ABA, o ramo que pede o código de 6 dígitos
 * no WhatsApp nunca rodava, e a leitura de fora era "o WhatsApp não funciona".
 *
 * Este teste roda o `estadoDaAba` real do arquivo publicado, não uma cópia.
 */
async function carregarEstadoDaAba() {
  const fonte = await readFile(
    path.join(process.cwd(), 'extensao-gerid', 'background.js'),
    'utf8',
  );

  const trechos = ['hostDaUrl', 'ehHostGerid', 'ehHostPat', 'estadoDaAba'].map((nome) => {
    const inicio = fonte.indexOf(`function ${nome}(`);
    expect(inicio, `função ${nome} sumiu do background.js`).toBeGreaterThan(-1);
    const fim = fonte.indexOf('\n}\n', inicio);
    return fonte.slice(inicio, fim + 2);
  });

  const fabrica = new Function(`
    const EstadoAutenticacao = { NECESSARIA: 'necessaria', AUTENTICADO: 'autenticado', SEM_ABA: 'sem_aba' };
    ${trechos.join('\n')}
    return estadoDaAba;
  `);
  return fabrica() as (tab: { url: string }) => string;
}

describe('extensão Gerid — classificação da aba não pode depender de porta', () => {
  it('reconhece o CAS do GERID mesmo na porta 8443', async () => {
    const estadoDaAba = await carregarEstadoDaAba();

    // O caso que quebrava: porta explícita.
    expect(estadoDaAba({
      url: 'https://geridinss.dataprev.gov.br:8443/cas/login?service=x',
    })).toBe('necessaria');

    // E o mesmo host sem porta continua valendo.
    expect(estadoDaAba({ url: 'https://geridinss.dataprev.gov.br/cas/login' })).toBe('necessaria');
  });

  it('mantém a sessão do PAT válida só nos caminhos de trabalho', async () => {
    const estadoDaAba = await carregarEstadoDaAba();

    expect(estadoDaAba({ url: 'https://atendimento.inss.gov.br/tarefas' })).toBe('autenticado');
    expect(estadoDaAba({ url: 'https://atendimento.inss.gov.br/requerimentos?p=2' })).toBe('autenticado');
    // Query e fragmento não podem promover uma tela qualquer a "autenticado".
    expect(estadoDaAba({ url: 'https://atendimento.inss.gov.br/login?next=/tarefas' })).toBe('necessaria');
    // Nem um host de terceiro que apenas cite o caminho.
    expect(estadoDaAba({ url: 'https://exemplo.invalido/tarefas' })).toBe('sem_aba');
  });
});
