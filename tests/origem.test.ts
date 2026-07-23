import { beforeEach, describe, expect, it } from 'vitest';
import { derivarOrigem, ORIGEM_DESCONHECIDA } from '../lib/server/origem';
import {
  checarLimite,
  registrarFalha,
  limparTentativas,
  resetarLimites,
} from '../lib/server/limiteTentativas';

/** Monta um leitor de cabeçalhos a partir de um objeto simples. */
function cabecalhos(h: Record<string, string>) {
  const normalizado = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return (nome: string) => normalizado.get(nome.toLowerCase()) ?? null;
}

describe('de quem veio a requisição', () => {
  it('prefere o header de valor único que o proxy sobrescreve', () => {
    const origem = derivarOrigem(
      cabecalhos({
        'x-envoy-external-address': '203.0.113.7',
        // Mentira plantada pelo cliente: tem que ser ignorada.
        'x-forwarded-for': '10.0.0.1, 203.0.113.7',
      }),
    );
    expect(origem).toBe('203.0.113.7');
  });

  it('no X-Forwarded-For usa o item da DIREITA, não o da esquerda', () => {
    // "1.1.1.1" foi o cliente que mandou; "203.0.113.7" a borda anexou.
    const origem = derivarOrigem(cabecalhos({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }));
    expect(origem).toBe('203.0.113.7');
    expect(origem).not.toBe('1.1.1.1');
  });

  it('sem cabeçalho nenhum, cai numa chave só (falha para o lado seguro)', () => {
    expect(derivarOrigem(cabecalhos({}))).toBe(ORIGEM_DESCONHECIDA);
  });

  it('ignora entradas vazias e espaços', () => {
    expect(derivarOrigem(cabecalhos({ 'x-forwarded-for': ' 1.1.1.1 ,  , 203.0.113.7 ' }))).toBe(
      '203.0.113.7',
    );
  });
});

describe('força bruta trocando de IP', () => {
  beforeEach(() => resetarLimites());

  it('NÃO burla o bloqueio inventando um X-Forwarded-For diferente a cada tentativa', () => {
    // O atacante vem sempre do mesmo lugar (203.0.113.7), mas a cada tentativa
    // planta um IP falso na esquerda da lista.
    const tentar = (falso: string) =>
      derivarOrigem(cabecalhos({ 'x-forwarded-for': `${falso}, 203.0.113.7` }));

    let ultimo = checarLimite(tentar('10.0.0.1'));
    for (let i = 0; i < 5; i++) {
      ultimo = registrarFalha(tentar(`10.0.0.${i}`));
    }

    // Todas as tentativas caíram na mesma chave real -> bloqueado.
    expect(ultimo.bloqueado).toBe(true);
    expect(checarLimite(tentar('10.0.0.99')).bloqueado).toBe(true);
  });

  it('o teto geral segura quem realmente tem muitos IPs', () => {
    // 20 origens distintas, 1 falha cada: nenhuma estoura o limite por IP.
    for (let i = 0; i < 20; i++) {
      registrarFalha(`198.51.100.${i}`);
    }
    // Mas o total geral estourou, então um IP novinho já chega bloqueado.
    expect(checarLimite('198.51.100.200').bloqueado).toBe(true);
  });

  it('teto geral não dispara antes da hora', () => {
    for (let i = 0; i < 19; i++) registrarFalha(`198.51.100.${i}`);
    expect(checarLimite('198.51.100.200').bloqueado).toBe(false);
  });

  it('login certo libera o bloqueio geral (não deixa o legítimo trancado fora)', () => {
    for (let i = 0; i < 20; i++) registrarFalha(`198.51.100.${i}`);
    expect(checarLimite('203.0.113.7').bloqueado).toBe(true);

    limparTentativas('203.0.113.7');
    expect(checarLimite('203.0.113.7').bloqueado).toBe(false);
  });

  it('o bloqueio geral expira junto com a janela de 15 min', () => {
    const agora = Date.now();
    for (let i = 0; i < 20; i++) registrarFalha(`198.51.100.${i}`, agora);
    expect(checarLimite('203.0.113.7', agora).bloqueado).toBe(true);
    expect(checarLimite('203.0.113.7', agora + 16 * 60 * 1000).bloqueado).toBe(false);
  });
});
