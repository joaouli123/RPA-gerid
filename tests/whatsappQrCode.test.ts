import { describe, expect, it, vi } from 'vitest';

/**
 * O QR code chegando até a tela.
 *
 * Isto existe por causa de uma falha que não estourava em lugar nenhum: a tela
 * ficava em "Preparando o QR code..." para sempre e o log dizia só "Conexão
 * caiu". O motivo era conexão SOBREPOSTA — cada tentativa abria mais um socket
 * sem encerrar o anterior, e quando o velho finalmente caía, o `close` dele
 * apagava o QR que o NOVO tinha acabado de publicar. Quanto mais o operador
 * clicava em "Gerar QR code", pior ficava.
 *
 * Nada disso dá erro: o pareamento simplesmente nunca acontece. Por isso fica
 * preso aqui.
 */

const { sockets } = vi.hoisted(() => ({ sockets: [] as SocketFalso[] }));

interface SocketFalso {
  ev: { on: (evento: string, fn: (dado: unknown) => void) => void };
  end: () => void;
  encerrado: boolean;
  emitir: (evento: string, dado: unknown) => void;
  sendMessage: () => Promise<{ key: { id: string } }>;
}

vi.mock('@whiskeysockets/baileys', () => {
  function criarSocket(): SocketFalso {
    const ouvintes: Record<string, Array<(dado: unknown) => void>> = {};
    const socket: SocketFalso = {
      ev: { on: (evento, fn) => { (ouvintes[evento] ??= []).push(fn); } },
      end: () => { socket.encerrado = true; },
      encerrado: false,
      emitir: (evento, dado) => { for (const fn of ouvintes[evento] ?? []) fn(dado); },
      sendMessage: async () => ({ key: { id: 'ROBO' } }),
    };
    sockets.push(socket);
    return socket;
  }

  return {
    makeWASocket: () => criarSocket(),
    useMultiFileAuthState: async () => ({
      state: { creds: { registered: false }, keys: {} },
      saveCreds: async () => undefined,
    }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0], isLatest: true }),
    makeCacheableSignalKeyStore: (chaves: unknown) => chaves,
    Browsers: { ubuntu: () => ['RPA Gerid', 'Chrome', '1.0'] },
    DisconnectReason: { loggedOut: 401 },
  };
});

/**
 * Ponte limpa a cada caso. Ela vive num Symbol do globalThis para sobreviver ao
 * hot reload do Next, então `resetModules` sozinho não a apaga.
 */
async function pontoZero() {
  // Sem número de configuração: quem parear define tudo. Se algum dia voltar a
  // existir variável de número, este teste continua passando sem ela — e é isso
  // que se quer dizer aqui.
  process.env.RPA_WHATSAPP_SESSAO = '.data/whatsapp-inexistente-de-teste';
  sockets.length = 0;
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('rpa-gerid.whatsapp')];
  vi.resetModules();
  return import('../lib/server/whatsapp');
}

describe('whatsapp - o QR chega na tela', () => {
  it('conexao velha caindo nao apaga o QR da conexao nova', async () => {
    const { garantirConexao, situacaoWhatsapp } = await pontoZero();

    await garantirConexao();
    const primeiro = sockets[0]!;

    // Segunda tentativa — é o que acontece quando o operador clica de novo, ou
    // quando a espera de reconexão vence antes de alguém escanear.
    await garantirConexao();
    const segundo = sockets[1]!;
    expect(segundo).not.toBe(primeiro);

    // Abrir a nova encerra a anterior: dois sockets vivos no mesmo número é o
    // que a Meta vê como sessão duplicada, além de bagunçar o estado aqui.
    expect(primeiro.encerrado).toBe(true);

    segundo.emitir('connection.update', { qr: 'QR-DA-CONEXAO-NOVA' });
    expect(situacaoWhatsapp().qr).toBe('QR-DA-CONEXAO-NOVA');

    // O socket velho cai agora, atrasado. Antes, esta linha zerava o QR acima e
    // a tela voltava sozinha para "Preparando o QR code...".
    primeiro.emitir('connection.update', {
      connection: 'close',
      lastDisconnect: { error: new Error('Connection Terminated') },
    });
    expect(situacaoWhatsapp().qr).toBe('QR-DA-CONEXAO-NOVA');
    expect(situacaoWhatsapp().conectado).toBe(false);

    // E o pareamento completa pela conexão que está de pé.
    segundo.emitir('connection.update', { connection: 'open' });
    const depois = situacaoWhatsapp();
    expect(depois.conectado).toBe(true);
    expect(depois.pareado).toBe(true);
    // QR usado é QR queimado: deixá-lo na tela faz escanear código morto.
    expect(depois.qr).toBeNull();
    expect(depois.ultimoErro).toBeNull();
  });

  it('conexao que morre ANTES de mostrar qualquer QR diz o motivo', async () => {
    const { garantirConexao, situacaoWhatsapp } = await pontoZero();
    await garantirConexao();

    // Nunca houve `qr` nesta conexão: ela morreu antes de começar. Isso não é o
    // ciclo normal do código expirando, é defeito — e é o caso em que a tela
    // ficava repetindo "Gerando um QR code novo..." sobre uma falha invisível.
    sockets[0]!.emitir('connection.update', {
      connection: 'close',
      lastDisconnect: { error: new Error('getaddrinfo ENOTFOUND web.whatsapp.com') },
    });

    const erro = situacaoWhatsapp().ultimoErro ?? '';
    expect(erro).toMatch(/ENOTFOUND web\.whatsapp\.com/);
    expect(erro).not.toMatch(/Gerando um QR code novo/);
  });

  it('QR que expira depois de aparecer e rotina, e nao assusta ninguem', async () => {
    const { garantirConexao, situacaoWhatsapp } = await pontoZero();
    await garantirConexao();

    // Apareceu, ninguém escaneou a tempo, o WhatsApp derrubou. Rotina.
    sockets[0]!.emitir('connection.update', { qr: 'QR-QUE-EXPIROU' });
    sockets[0]!.emitir('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });

    expect(situacaoWhatsapp().ultimoErro).toBe('Gerando um QR code novo...');
    // O código morto sai da tela: escaneá-lo não pareia nada.
    expect(situacaoWhatsapp().qr).toBeNull();
  });
});
