import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Desvincular o número pelo painel.
 *
 * Antes disso, trocar de número era impossível daqui: enquanto `creds.json`
 * estivesse em disco com `registered: true`, o Baileys reconectava na MESMA
 * conta e nunca emitia QR. O botão "Parear outro número" prometia a troca e
 * entregava uma reconexão no mesmo aparelho; quem precisava trocar de verdade
 * tinha que apagar a pasta na VPS à mão.
 *
 * Os dois casos aqui são os que doem: apagar o que devia e NÃO apagar o que
 * não devia — isto é um `rm -r` guiado por variável de ambiente.
 */

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: () => ({
    ev: { on: () => undefined },
    end: () => undefined,
    logout: async () => undefined,
    sendMessage: async () => ({ key: { id: 'ROBO' } }),
  }),
  useMultiFileAuthState: async () => ({
    state: { creds: { registered: true }, keys: {} },
    saveCreds: async () => undefined,
  }),
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  makeCacheableSignalKeyStore: (chaves: unknown) => chaves,
  Browsers: { ubuntu: () => ['RPA Gerid', 'Chrome', '1.0'] },
  DisconnectReason: { loggedOut: 401 },
}));

/** A ponte mora num Symbol do globalThis, então `resetModules` sozinho não a limpa. */
async function carregar(pasta: string) {
  process.env.RPA_WHATSAPP_SESSAO = pasta;
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('rpa-gerid.whatsapp')];
  vi.resetModules();
  return import('../lib/server/whatsapp');
}

async function existe(alvo: string) {
  try {
    await access(alvo);
    return true;
  } catch {
    return false;
  }
}

describe('whatsapp - desvincular pelo painel', () => {
  it('apaga a credencial, e so por isso a tela volta a pedir QR', async () => {
    const pasta = await mkdtemp(path.join(tmpdir(), 'rpa-wpp-'));
    const creds = path.join(pasta, 'creds.json');
    await writeFile(creds, JSON.stringify({ registered: true }), 'utf8');

    const { desvincularWhatsapp, manterConexaoViva, situacaoWhatsapp } = await carregar(pasta);

    // Estado de partida: pareado, sem QR, nada a fazer na tela.
    await manterConexaoViva();
    expect(situacaoWhatsapp().pareado).toBe(true);

    expect(await desvincularWhatsapp()).toEqual({ ok: true });

    expect(await existe(creds)).toBe(false);
    // O `manterConexaoViva` roda a cada consulta de status: se ele religasse
    // aqui, o "desconectar" duraria até a próxima batida da tela.
    await manterConexaoViva();
    const situacao = situacaoWhatsapp();
    expect(situacao.pareado).toBe(false);
    expect(situacao.conectado).toBe(false);
    // É este campo que faz a tela pedir o QR — ou seja, o outro número entra.
    expect(situacao.precisaParear).toBe(true);
  });

  it('recusa apagar quando a variavel de ambiente aponta para fora de uma pasta de sessao', async () => {
    // `RPA_WHATSAPP_SESSAO` vem do ambiente do servidor. Mal preenchida, um
    // clique num botão de painel viraria `rm -r` na raiz do processo.
    const { desvincularWhatsapp } = await carregar(process.cwd());

    const resultado = await desvincularWhatsapp();

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain('Recuso');
    expect(await existe(path.join(process.cwd(), 'package.json'))).toBe(true);
  });
});
