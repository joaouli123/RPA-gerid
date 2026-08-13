import { describe, expect, it } from 'vitest';

import { ehRespostaDoOperador, mesmoNumero } from '../lib/server/whatsapp';

/**
 * Quem pode entregar os 6 dígitos do 2FA.
 *
 * O modo que interessa é o do MESMO número: o robô pareia o celular do próprio
 * operador e usa a conversa dele consigo mesmo. Nesse arranjo o WhatsApp marca
 * como "minha mensagem" tanto o que o robô manda quanto o que o operador
 * digita — os dois com `fromMe: true` e o mesmo destinatário. Quem descartar
 * por `fromMe` derruba a resposta e o login nunca completa; quem aceitar tudo
 * faz o robô responder ao próprio eco.
 *
 * A comparação é pelo NÚMERO, não pela string do JID: a mesma pessoa chega ora
 * como `numero@s.whatsapp.net`, ora com sufixo de aparelho (`numero:88@...`),
 * ora pelo endereçamento novo `@lid` — e nesse caso o número real vem no
 * `remoteJidAlt`. Igualdade crua descartava a resposta em silêncio.
 */
const NUMERO = '5511999999999';
const OPERADOR = `${NUMERO}@s.whatsapp.net`;
const autorizados = () => new Set([NUMERO]);

describe('whatsapp - conversa do numero consigo mesmo', () => {
  it('aceita a resposta do operador na conversa dele consigo mesmo', () => {
    // fromMe = true porque é ele digitando no proprio chat. Isso é a resposta.
    const enviadas = new Set(['ROBO-1']);
    expect(
      ehRespostaDoOperador({ remoteJid: OPERADOR, fromMe: true, id: 'HUMANO-1' }, autorizados(), enviadas),
    ).toBe(true);
  });

  it('ignora o eco da mensagem que o proprio robo mandou', () => {
    const enviadas = new Set(['ROBO-1']);
    expect(
      ehRespostaDoOperador({ remoteJid: OPERADOR, fromMe: true, id: 'ROBO-1' }, autorizados(), enviadas),
    ).toBe(false);
  });

  it('aceita a resposta vinda de chip separado', () => {
    // Arranjo de dois números: a mensagem do operador chega com fromMe = false.
    expect(
      ehRespostaDoOperador({ remoteJid: OPERADOR, fromMe: false, id: 'X' }, autorizados(), new Set()),
    ).toBe(true);
  });

  it('aceita o mesmo numero com sufixo de aparelho', () => {
    // O `:88` identifica QUAL aparelho da conta mandou. É a mesma pessoa.
    expect(
      ehRespostaDoOperador(
        { remoteJid: `${NUMERO}:88@s.whatsapp.net`, fromMe: false, id: 'X' },
        autorizados(),
        new Set(),
      ),
    ).toBe(true);
  });

  it('aceita mensagem endereçada por @lid quando o alt prova o numero', () => {
    // Endereçamento novo do WhatsApp: o `remoteJid` é um id opaco e o número
    // autorizado vem no `remoteJidAlt`, no mesmo pacote.
    expect(
      ehRespostaDoOperador(
        { remoteJid: '106846589309017@lid', remoteJidAlt: OPERADOR, fromMe: false, id: 'X' },
        autorizados(),
        new Set(),
      ),
    ).toBe(true);
  });

  it('recusa @lid que nao se resolve em numero conhecido', () => {
    // Sem o `remoteJidAlt` não há como saber de quem é. Aceitar "porque veio por
    // @lid" seria aceitar 6 dígitos de qualquer um para entrar no GERID.
    expect(
      ehRespostaDoOperador(
        { remoteJid: '999999999999@lid', fromMe: false, id: 'X' },
        autorizados(),
        new Set(),
      ),
    ).toBe(false);
  });

  it('recusa qualquer outro numero e qualquer grupo', () => {
    const outro = '5511888888888@s.whatsapp.net';
    expect(ehRespostaDoOperador({ remoteJid: outro, fromMe: false, id: 'X' }, autorizados(), new Set()))
      .toBe(false);
    // Em grupo qualquer participante poderia mandar 6 dígitos e entrar no GERID.
    // Recusado mesmo que o alt aponte para o operador: a mensagem foi para um
    // grupo, e num grupo a plateia é outra.
    expect(
      ehRespostaDoOperador(
        { remoteJid: '12345-67890@g.us', remoteJidAlt: OPERADOR, fromMe: false, id: 'X' },
        autorizados(),
        new Set(),
      ),
    ).toBe(false);
  });
});

/**
 * O nono dígito do celular brasileiro.
 *
 * O WhatsApp guarda números de DDD >= 31 SEM ele — a conta pareada aparece no
 * log do servidor com doze dígitos. Então o que a pessoa digita no `.env` e o
 * que o WhatsApp devolve são a mesma linha escrita de dois jeitos, e a
 * conferência "pareou o celular certo?" precisa saber disso. Apertada demais,
 * acusa celular errado tendo pareado o certo; frouxa demais, deixa passar
 * pareamento de outra pessoa.
 */
describe('whatsapp - nono digito', () => {
  it('reconhece o mesmo celular com e sem o nono digito', () => {
    expect(mesmoNumero('5541987038339', '554187038339')).toBe(true);
    expect(mesmoNumero('554187038339', '5541987038339')).toBe(true);
    expect(mesmoNumero('5541987038339', '5541987038339')).toBe(true);
    // Com máscara também: o que vem do `.env` pode vir formatado.
    expect(mesmoNumero('+55 (41) 98703-8339', '554187038339')).toBe(true);
  });

  it('nao confunde celulares diferentes', () => {
    expect(mesmoNumero('5541987038339', '5541999077637')).toBe(false);
    // Um dígito de diferença continua sendo outra pessoa.
    expect(mesmoNumero('5541987038339', '5541987038330')).toBe(false);
    // Mesmo número local, DDD diferente.
    expect(mesmoNumero('5541987038339', '5511987038339')).toBe(false);
    expect(mesmoNumero('', '554187038339')).toBe(false);
  });

  it('nao aplica a regra do nono digito fora do celular brasileiro', () => {
    // `19...` não é DDI 55; tirar um "9" do meio de um número estrangeiro
    // inventaria uma coincidência que não existe.
    expect(mesmoNumero('19419870383', '1419870383')).toBe(false);
  });
});
