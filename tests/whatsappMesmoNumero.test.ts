import { describe, expect, it } from 'vitest';

import { ehRespostaDoOperador } from '../lib/server/whatsapp';

/**
 * Quem pode entregar os 6 dígitos do 2FA.
 *
 * O modo que interessa é o do MESMO número: o robô pareia o celular do próprio
 * operador e usa a conversa dele consigo mesmo. Nesse arranjo o WhatsApp marca
 * como "minha mensagem" tanto o que o robô manda quanto o que o operador
 * digita — os dois com `fromMe: true` e o mesmo destinatário. Quem descartar
 * por `fromMe` derruba a resposta e o login nunca completa; quem aceitar tudo
 * faz o robô responder ao próprio eco.
 */
const OPERADOR = '5511999999999@s.whatsapp.net';

describe('whatsapp - conversa do numero consigo mesmo', () => {
  it('aceita a resposta do operador na conversa dele consigo mesmo', () => {
    // fromMe = true porque é ele digitando no proprio chat. Isso é a resposta.
    const enviadas = new Set(['ROBO-1']);
    expect(
      ehRespostaDoOperador({ remoteJid: OPERADOR, fromMe: true, id: 'HUMANO-1' }, OPERADOR, enviadas),
    ).toBe(true);
  });

  it('ignora o eco da mensagem que o proprio robo mandou', () => {
    const enviadas = new Set(['ROBO-1']);
    expect(
      ehRespostaDoOperador({ remoteJid: OPERADOR, fromMe: true, id: 'ROBO-1' }, OPERADOR, enviadas),
    ).toBe(false);
  });

  it('aceita a resposta vinda de chip separado', () => {
    // Arranjo de dois números: a mensagem do operador chega com fromMe = false.
    expect(
      ehRespostaDoOperador({ remoteJid: OPERADOR, fromMe: false, id: 'X' }, OPERADOR, new Set()),
    ).toBe(true);
  });

  it('recusa qualquer outro numero e qualquer grupo', () => {
    const outro = '5511888888888@s.whatsapp.net';
    expect(ehRespostaDoOperador({ remoteJid: outro, fromMe: false, id: 'X' }, OPERADOR, new Set()))
      .toBe(false);
    // Em grupo qualquer participante poderia mandar 6 dígitos e entrar no GERID.
    expect(
      ehRespostaDoOperador(
        { remoteJid: '12345-67890@g.us', fromMe: false, id: 'X' },
        OPERADOR,
        new Set(),
      ),
    ).toBe(false);
  });
});
