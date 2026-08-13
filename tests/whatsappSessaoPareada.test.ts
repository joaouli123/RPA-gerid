import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * O que conta como "já pareado".
 *
 * O Baileys grava `creds.json` durante o handshake — ANTES de alguém apontar a
 * câmera. Um pareamento que começou e não terminou deixa o arquivo lá, com
 * `registered: false`. Quem olhar só a existência do arquivo conclui que a
 * sessão está pareada: a tela passa a mostrar "vinculado • reconectando" e
 * nunca mais pede QR. Ninguém vê erro nenhum — o 2FA só nunca chega.
 *
 * E com volume persistente isso não se resolve sozinho: o arquivo ruim fica
 * entre um deploy e outro.
 */

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: () => ({
    ev: { on: () => undefined },
    end: () => undefined,
    sendMessage: async () => ({ key: { id: 'ROBO' } }),
  }),
  useMultiFileAuthState: async () => ({
    state: { creds: { registered: false }, keys: {} },
    saveCreds: async () => undefined,
  }),
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  makeCacheableSignalKeyStore: (chaves: unknown) => chaves,
  Browsers: { ubuntu: () => ['RPA Gerid', 'Chrome', '1.0'] },
  DisconnectReason: { loggedOut: 401 },
}));

/**
 * Cada caso precisa de uma ponte limpa. Ela vive num Symbol do globalThis para
 * sobreviver ao hot reload do Next, então `resetModules` sozinho não a apaga.
 */
async function carregarComCredencial(creds: Record<string, unknown> | null) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'rpa-wpp-'));
  if (creds) {
    await writeFile(path.join(pasta, 'creds.json'), JSON.stringify(creds), 'utf8');
  }
  process.env.RPA_WHATSAPP_SESSAO = pasta;

  delete (globalThis as Record<symbol, unknown>)[Symbol.for('rpa-gerid.whatsapp')];
  vi.resetModules();
  return import('../lib/server/whatsapp');
}

describe('whatsapp - o que conta como sessao pareada', () => {
  it('credencial de pareamento INTERROMPIDO nao vale: a tela precisa do QR', async () => {
    const { manterConexaoViva, situacaoWhatsapp } = await carregarComCredencial({
      registered: false,
      noiseKey: { private: 'x', public: 'y' },
    });

    await manterConexaoViva();

    const situacao = situacaoWhatsapp();
    expect(situacao.pareado).toBe(false);
    // É este campo que faz a tela pedir o QR. Dando false aqui, o operador fica
    // olhando "reconectando" para uma sessão que nunca existiu.
    expect(situacao.precisaParear).toBe(true);
  });

  it('credencial de pareamento COMPLETO vale: volta sozinha, sem QR', async () => {
    const { manterConexaoViva, situacaoWhatsapp } = await carregarComCredencial({
      registered: true,
      noiseKey: { private: 'x', public: 'y' },
    });

    await manterConexaoViva();

    const situacao = situacaoWhatsapp();
    expect(situacao.pareado).toBe(true);
    // Escanear aqui DERRUBA a credencial boa que está em disco.
    expect(situacao.precisaParear).toBe(false);
  });

  it('pasta vazia e sessao nova', async () => {
    const { manterConexaoViva, situacaoWhatsapp } = await carregarComCredencial(null);

    await manterConexaoViva();

    expect(situacaoWhatsapp().pareado).toBe(false);
    expect(situacaoWhatsapp().precisaParear).toBe(true);
  });
});
