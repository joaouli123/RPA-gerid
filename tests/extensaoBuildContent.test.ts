import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const pasta = path.join(process.cwd(), 'extensao-gerid');
const ler = (arquivo: string) => readFile(path.join(pasta, arquivo), 'utf8');

/**
 * O background confere a VERSÃO do content script que já está na aba, e não
 * apenas se existe algum. Precisa ser assim: aba aberta antes da atualização
 * continua com o content.js antigo carregado, respondendo a tudo normalmente —
 * só que com o código de ontem.
 *
 * O preço é uma string repetida em três arquivos. Quando ela sai de sincronia a
 * comparação falha SEMPRE: o content.js é reinjetado a cada chamada, o guard
 * para de guardar e nada disso aparece como erro — só como robô lento e
 * comportamento que não bate com o código. Foi o que ficou acontecendo em
 * produção. Por isso a sincronia é teste, não disciplina.
 */
describe('build do content script', () => {
  it('background, fonte e bundle apontam para o mesmo build', async () => {
    const [background, fonte, bundle] = await Promise.all([
      ler('background.js'),
      ler(path.join('src', 'index.ts')),
      ler('content.js'),
    ]);

    const esperado = background.match(/const BUILD_CONTENT_ESPERADO = '([^']+)'/)?.[1];
    expect(esperado, 'BUILD_CONTENT_ESPERADO sumiu do background.js').toBeTruthy();

    expect(fonte, 'src/index.ts nao declara o mesmo build que o background espera')
      .toContain(`const CONTENT_BUILD_ID = '${esperado}'`);

    // O bundle é gerado a partir da fonte; se ele ficou para trás, o navegador
    // recebe um build que o background vai rejeitar para sempre.
    expect(bundle, 'content.js foi gerado de uma versao anterior de src/index.ts')
      .toContain(`CONTENT_BUILD_ID = "${esperado}"`);

    // E a comparação tem que ser contra a constante, não contra uma string solta
    // colada dentro da função injetada — que foi como ela envelheceu sem ninguém ver.
    expect(background).not.toMatch(/__GERID_RPA_CONTENT_BUILD__ === '[\d.]/);
  });
});
