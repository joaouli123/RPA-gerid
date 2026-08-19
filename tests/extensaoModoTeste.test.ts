import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ler = (arquivo: string) =>
  readFile(path.join(process.cwd(), 'extensao-gerid', arquivo), 'utf8');

/**
 * "Testar somente o primeiro caso da fila" nascia LIGADO.
 *
 * O efeito era invisivel e caro: o robo protocolava um caso, terminava a
 * rodada anunciando sucesso, e os outros da fila nem chegavam a ser
 * considerados. Quem olhava so via "protocolou e parou" e clicava em Iniciar de
 * novo — quatro clientes, quatro cliques, o dia inteiro. A opcao morava dentro
 * de "Configuracao avancada", recolhida, entao ninguem tinha por que suspeitar
 * dela.
 *
 * Padrao de robo de fila e processar a fila. Testar um caso so e o pedido
 * especial, e pedido especial se marca na mao. Estes testes prendem esse
 * padrao nos tres lugares onde ele pode escapar — e sao testes de FONTE porque
 * o defeito nao estava na logica, estava no valor inicial.
 */
describe('modo teste nasce desligado', () => {
  it('o checkbox do popup nao vem marcado no HTML', async () => {
    const html = await ler('popup.html');
    const campo = html.match(/<input[^>]*id="modoTeste"[^>]*>/)?.[0] ?? '';
    expect(campo, 'o input do modo teste sumiu do popup').not.toBe('');
    expect(campo).not.toContain('checked');
  });

  it('o popup trata ausencia de configuracao como desligado', async () => {
    const js = await ler('popup.js');
    // `!== false` era a forma antiga: com storage vazio, ligava.
    expect(js).not.toContain('result.modoTeste !== false');
    expect(js).toContain('result.modoTeste === true');
  });

  it('a ronda automatica tambem trata ausencia como desligado', async () => {
    const js = await ler('background.js');
    expect(js).not.toContain('salvo?.modoTeste !== false');
    expect(js).toContain('salvo?.modoTeste === true');
    // Assercao ampla de proposito. A primeira versao deste teste listava os
    // lugares um a um e passou verde com DOIS `!== false` ainda no arquivo: a
    // leitura do storage dentro da `rondaContinua` e o padrao da mensagem
    // `start`. O padrao errado ali era o pior de todos — a ronda acorda de 5 em
    // 5 minutos, protocolava um caso e voltava a dormir. Qualquer forma nova de
    // escrever isso tem que cair aqui, nao numa lista que alguem esqueceu de
    // atualizar.
    expect(js).not.toMatch(/modoTeste\s*!==\s*false/);
  });

  it('a fila truncada pelo modo teste e anunciada no log', async () => {
    // Truncar em silencio foi o que escondeu o problema: sem esta linha, o
    // proximo a investigar recomeca do zero.
    const js = await ler('background.js');
    expect(js).toContain('MODO TESTE ligado');
  });

  it('existe migracao para desligar o modo teste ja gravado nas maquinas', async () => {
    // Trocar o padrao nao alcanca quem ja tem `modoTeste: true` no storage.
    const js = await ler('background.js');
    expect(js).toContain('desligarModoTesteHerdado');
    expect(js).toContain("chrome.storage.local.remove('modoTeste')");
  });
});
