import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_EVENTOS,
  nivelDoEvento,
  normalizarEventos,
  ondeTravou,
  passoDoEvento,
} from '../lib/eventosExecucao';

/**
 * O diario de bordo existe porque ate 19/08/2026 o robo so contava o que estava
 * fazendo no popup do Chrome — que morre junto com o service worker e so pode
 * ser lido na maquina que esta rodando. O painel mostrava "Processando" e mais
 * nada, e quando o robo parava a tela nao dizia onde nem por que.
 */
describe('classificacao das linhas do diario', () => {
  it('destaca a linha que explica uma parada', () => {
    expect(nivelDoEvento('Nao encontrei o municipio na lista de orgao pagador.')).toBe('erro');
    expect(nivelDoEvento('O preenchimento parou em "Orgao Pagador".')).toBe('erro');
  });

  it('trata protocolo como boa noticia mesmo com uma ressalva junto', () => {
    // "Protocolado, mas o comprovante falhou" tem as duas palavras. Marcar como
    // erro pintaria de vermelho a linha que anuncia o unico resultado que
    // importa — e o operador aprenderia a desconfiar do vermelho.
    expect(nivelDoEvento('PROTOCOLADO 1234567890; comprovante falhou no Drive.')).toBe('sucesso');
  });

  it('separa rotina de recado', () => {
    expect(nivelDoEvento('Abri a aba do GERID.')).toBe('info');
    expect(nivelDoEvento('Aguardando SafeID e codigo do autenticador.')).toBe('aviso');
  });

  it('le o numero do passo da marca que o robo ja escreve', () => {
    expect(passoDoEvento('[P9] municipio alternativo: CAMAMU')).toBe(9);
    expect(passoDoEvento('sem marca nenhuma')).toBeUndefined();
    // `[P42]` nao e passo do formulario; aceitar viraria "passo 42 de 10".
    expect(passoDoEvento('[P42] qualquer coisa')).toBeUndefined();
  });
});

describe('normalizacao do lote que chega da extensao', () => {
  it('descarta repeticao imediata', () => {
    // A extensao tenta em laco e escreve a mesma frase a cada volta. Trinta
    // linhas iguais empurram para fora da janela a linha diferente que explica
    // a parada.
    const eventos = normalizarEventos([
      { mensagem: 'Esperando a tela carregar.' },
      { mensagem: 'Esperando a tela carregar.' },
      { mensagem: 'Esperando a tela carregar.' },
      { mensagem: 'Tela carregou.' },
    ]);
    expect(eventos.map((e) => e.mensagem)).toEqual(['Esperando a tela carregar.', 'Tela carregou.']);
  });

  it('nao repete a ultima linha que ja estava guardada', () => {
    const antes = normalizarEventos([{ mensagem: 'Abri a aba.' }]);
    expect(normalizarEventos([{ mensagem: 'Abri a aba.' }], antes)).toEqual([]);
  });

  it('carimbo ilegivel nao derruba a linha', () => {
    // Perder o relato por causa da data seria jogar fora justamente o que
    // estamos tentando salvar.
    const [evento] = normalizarEventos([{ mensagem: 'Algo aconteceu.', em: 'ontem de tarde' }]);
    expect(evento?.mensagem).toBe('Algo aconteceu.');
    expect(Number.isNaN(new Date(evento?.em ?? '').getTime())).toBe(false);
  });

  it('ignora lote que nao e lista e linha vazia', () => {
    expect(normalizarEventos(null)).toEqual([]);
    expect(normalizarEventos('nao sou lista')).toEqual([]);
    expect(normalizarEventos([{ mensagem: '   ' }, {}])).toEqual([]);
  });

  it('nao aceita lote maior que a janela inteira', () => {
    const enorme = Array.from({ length: MAX_EVENTOS + 200 }, (_, i) => ({ mensagem: `linha ${i}` }));
    expect(normalizarEventos(enorme).length).toBeLessThanOrEqual(MAX_EVENTOS);
  });
});

describe('onde o robo travou', () => {
  it('aponta o ultimo erro', () => {
    const eventos = normalizarEventos([
      { mensagem: 'Abri a aba.' },
      { mensagem: 'Nao consegui selecionar o municipio.' },
      { mensagem: 'Fechando.' },
    ]);
    expect(ondeTravou(eventos)?.mensagem).toBe('Nao consegui selecionar o municipio.');
  });

  it('esquece o erro quando veio um protocolo depois', () => {
    // Erro seguido de protocolo e problema resolvido. Mostra-lo como parada
    // atual mandaria o operador investigar algo que ja passou.
    const eventos = normalizarEventos([
      { mensagem: 'A tentativa falhou.' },
      { mensagem: 'PROTOCOLADO 123456.' },
    ]);
    expect(ondeTravou(eventos)).toBeNull();
  });

  it('rodada tranquila nao inventa parada', () => {
    expect(ondeTravou(normalizarEventos([{ mensagem: 'Abri a aba.' }]))).toBeNull();
    expect(ondeTravou([])).toBeNull();
  });
});

describe('a extensao manda o relato para o painel', () => {
  const ler = () =>
    readFile(path.join(process.cwd(), 'extensao-gerid', 'background.js'), 'utf8');

  it('sendLog alimenta a fila do painel, e nao so o popup', async () => {
    // Sem esta linha o relato volta a existir apenas no Chrome do operador,
    // que foi exatamente o problema.
    const js = await ler();
    expect(js).toMatch(/function sendLog\([\s\S]{0,200}enfileirarRelato\(message\)/);
    expect(js).toContain("'/api/ext/log'");
  });

  it('o destino do relato e desligado no fim da rodada', async () => {
    // E o desligamento que despacha o buffer. A ultima linha da rodada e
    // justamente a que explica o fim dela.
    const js = await ler();
    expect(js).toContain('definirDestinoDoRelato(null)');
  });
});
