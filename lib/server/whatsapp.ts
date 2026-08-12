import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { responderDesafio } from './desafio2fa';

/**
 * Ponte de WhatsApp do robô, via Baileys (cliente não-oficial).
 *
 * Serve para DUAS coisas e nada além disso:
 *   1. avisar o operador que o GERID pediu autenticação;
 *   2. receber de volta os 6 dígitos que ele leu no Google Authenticator.
 *
 * A semente do autenticador continua só no celular dele. O robô nunca gera
 * código — ele só digita o que o humano mandou, como um teclado remoto.
 *
 * Funciona de dois jeitos:
 *   - chip separado: o robô manda para o número do operador (duas contas);
 *   - MESMO número: a ponte pareia o próprio celular do operador e conversa na
 *     "Mensagem para mim mesmo" dele. Não precisa de segundo chip, e o aviso
 *     chega na conversa que ele já tem aberta.
 *
 * ⚠️ Baileys é cliente não-oficial: a Meta pode banir o número pareado. Com chip
 * separado, um banimento custa um chip. Com o número principal do escritório,
 * custa a linha que atende os clientes. É uma escolha de risco, não de código.
 */

/** Só aceita mensagem deste número. Formato: só dígitos, com DDI. Ex.: 5511999999999. */
const numeroAutorizado = () => (process.env.RPA_WHATSAPP_NUMERO ?? '').replace(/\D/g, '');

/**
 * Pasta da sessão pareada. Sobrevive a restart — sem ela, o QR code teria que
 * ser lido de novo a cada deploy. NÃO versionar: é credencial.
 */
const pastaSessao = () => process.env.RPA_WHATSAPP_SESSAO?.trim() || '.data/whatsapp';

export function whatsappConfigurado(): boolean {
  return numeroAutorizado().length >= 12;
}

function jidDoOperador(): string {
  return `${numeroAutorizado()}@s.whatsapp.net`;
}

interface Ponte {
  socket: WASocket | null;
  conectando: Promise<void> | null;
  conectado: boolean;
  /** Último QR gerado, para o operador parear pela tela de configurações. */
  qr: string | null;
  ultimoErro: string | null;
  /** Código de 8 letras a digitar no celular, enquanto o pareamento não conclui. */
  codigoPareamento: string | null;
  /**
   * Ids das mensagens que o PRÓPRIO robô mandou.
   *
   * Existe por causa da conversa do número consigo mesmo ("Mensagem para mim
   * mesmo"): lá o que o robô envia e o que o operador digita chegam os dois com
   * `fromMe: true` e o mesmo `remoteJid`. Não dá para separar um do outro pela
   * mensagem — só sabendo quais ids saíram daqui.
   */
  enviadas: Set<string>;
}

// O socket precisa sobreviver ao hot reload do Next em desenvolvimento, senão
// cada salvamento de arquivo abriria uma conexão nova com o WhatsApp.
const chave = Symbol.for('rpa-gerid.whatsapp');
const raiz = globalThis as unknown as Record<symbol, Ponte | undefined>;
raiz[chave] ??= {
  socket: null,
  conectando: null,
  conectado: false,
  qr: null,
  ultimoErro: null,
  codigoPareamento: null,
  enviadas: new Set(),
};
const ponte = raiz[chave]!;
// Uma ponte que sobreviveu ao hot reload pode ter sido criada por uma versão
// anterior deste arquivo, sem o campo novo.
ponte.enviadas ??= new Set();

/**
 * Envia e anota o id, para não confundir o eco da própria mensagem com resposta
 * do operador. Guarda só as últimas: o robô manda pouca coisa, e um Set que
 * cresce para sempre num processo que fica meses no ar é vazamento.
 */
async function enviarTexto(socket: WASocket, texto: string): Promise<void> {
  const enviada = await socket.sendMessage(jidDoOperador(), { text: texto });
  const id = enviada?.key?.id;
  if (!id) return;
  ponte.enviadas.add(id);
  if (ponte.enviadas.size > 50) {
    ponte.enviadas.delete(ponte.enviadas.values().next().value!);
  }
}

/** Texto da mensagem, seja ela simples ou com citação. */
function textoDaMensagem(mensagem: {
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
  } | null;
}): string {
  const conteudo = mensagem.message;
  return (conteudo?.conversation || conteudo?.extendedTextMessage?.text || '').trim();
}

/**
 * Se esta mensagem vale como resposta do operador.
 *
 * Separado e exportado porque errar aqui não dá erro nenhum: o 2FA simplesmente
 * nunca completa (resposta descartada) ou o robô responde ao próprio eco. Os
 * dois casos são silenciosos, então ficam presos em teste.
 */
export function ehRespostaDoOperador(
  key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null },
  jidEsperado: string,
  enviadasPeloRobo: Set<string>,
): boolean {
  // Um JID de grupo termina em @g.us. Só conversa direta com o número
  // autorizado vale — em grupo qualquer participante poderia responder.
  if (key.remoteJid !== jidEsperado) return false;
  // Aqui NÃO se descarta por `fromMe`. Quando o robô usa o mesmo número do
  // operador, a conversa é a dele consigo mesmo, e tudo que ele digita vem
  // marcado como "minha mensagem" — jogar fora por isso cortaria justamente a
  // resposta que estamos esperando. O que precisa ser ignorado é só o eco do
  // que saiu daqui, e disso guardamos o id.
  if (key.fromMe && key.id && enviadasPeloRobo.has(key.id)) return false;
  return true;
}

async function tratarMensagem(socket: WASocket, mensagem: {
  key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null };
  message?: Parameters<typeof textoDaMensagem>[0]['message'];
}) {
  if (!ehRespostaDoOperador(mensagem.key, jidDoOperador(), ponte.enviadas)) return;

  const texto = textoDaMensagem({ message: mensagem.message });
  const digitos = texto.match(/\b(\d{6})\b/);
  if (!digitos) return;

  const resultado = responderDesafio(digitos[1]!);
  // A resposta ao operador nunca repete o código de volta: mensagem entregue
  // é mensagem que fica no histórico do aparelho dele.
  const aviso = resultado.ok
    ? '✅ Código recebido. Entrando no GERID...'
    : {
      sem_pedido: '⚠️ Recebi um código que ninguém pediu, e ignorei. Se não foi você agora,'
        + ' alguém pode estar tentando entrar no GERID.',
      expirado: '⏱️ O código chegou tarde (a janela é de 2 minutos). Vou pedir de novo.',
      ja_respondido: 'ℹ️ Já tinha recebido um código para este login. Ignorei o segundo.',
    }[resultado.motivo];

  await enviarTexto(socket, aviso).catch(() => undefined);
}

async function conectar(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(pastaSessao());
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys),
    },
    browser: Browsers.ubuntu('RPA Gerid'),
    // O robô não é um leitor de WhatsApp: não marca nada como visto nem
    // sincroniza histórico. Menos tráfego, menos chance de a Meta estranhar.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  ponte.socket = socket;

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (atualizacao) => {
    if (atualizacao.qr) {
      ponte.qr = atualizacao.qr;
      console.log('[WhatsApp] Leia o QR code para parear o número do robô.');
    }
    if (atualizacao.connection === 'open') {
      ponte.conectado = true;
      ponte.qr = null;
      ponte.codigoPareamento = null;
      ponte.ultimoErro = null;
      console.log('[WhatsApp] Conectado.');
    }
    if (atualizacao.connection === 'close') {
      ponte.conectado = false;
      ponte.socket = null;
      ponte.conectando = null;
      const erroFechamento = atualizacao.lastDisconnect?.error as
        { output?: { statusCode?: number } } | undefined;
      const causa = erroFechamento?.output?.statusCode;
      // `loggedOut` = o operador desvinculou o aparelho. Reconectar em laço só
      // gastaria a VPS; é preciso ler o QR de novo.
      if (causa === DisconnectReason.loggedOut) {
        ponte.ultimoErro = 'Sessão encerrada no celular. É preciso parear de novo pelo QR code.';
        console.log(`[WhatsApp] ${ponte.ultimoErro}`);
        return;
      }
      ponte.ultimoErro = `Conexão caiu (código ${causa ?? 'desconhecido'}). Reconectando...`;
      console.log(`[WhatsApp] ${ponte.ultimoErro}`);
      setTimeout(() => { void garantirConexao(); }, 3_000);
    }
  });

  socket.ev.on('messages.upsert', ({ messages }) => {
    for (const mensagem of messages) {
      void tratarMensagem(socket, mensagem as Parameters<typeof tratarMensagem>[1])
        .catch((erro) => console.log(`[WhatsApp] Falha ao tratar mensagem: ${erro}`));
    }
  });
}

/** Sobe a conexão se ainda não existir. Chamadas simultâneas compartilham a mesma. */
export async function garantirConexao(): Promise<void> {
  if (!whatsappConfigurado()) throw new Error('RPA_WHATSAPP_NUMERO não configurado.');
  if (ponte.socket && ponte.conectado) return;
  ponte.conectando ??= conectar().finally(() => { ponte.conectando = null; });
  await ponte.conectando;
}

export async function avisarOperador(texto: string): Promise<boolean> {
  if (!whatsappConfigurado()) return false;
  try {
    await garantirConexao();
    if (!ponte.socket) return false;
    await enviarTexto(ponte.socket, texto);
    return true;
  } catch (erro) {
    ponte.ultimoErro = erro instanceof Error ? erro.message : String(erro);
    console.log(`[WhatsApp] Não consegui avisar o operador: ${ponte.ultimoErro}`);
    return false;
  }
}

/**
 * Pareia o número SEM QR code: o WhatsApp aceita "Conectar com número de
 * telefone", onde o celular pede um código de 8 letras que aparece aqui.
 *
 * É o único jeito que funciona pelo painel. O QR do Baileys só existe como
 * string no terminal do servidor — inútil para quem usa o sistema no navegador,
 * ainda mais com o painel publicado. Com código digitado, o operador pareia o
 * PRÓPRIO celular e a conversa do 2FA passa a ser a dele consigo mesmo.
 */
export async function parearPorCodigo(): Promise<
  { ok: true; codigo?: string; jaPareado?: boolean } | { ok: false; erro: string }
> {
  if (!whatsappConfigurado()) {
    return { ok: false, erro: 'RPA_WHATSAPP_NUMERO não configurado no servidor.' };
  }
  if (ponte.conectado) return { ok: true, jaPareado: true };

  try {
    await garantirConexao();
    const socket = ponte.socket;
    if (!socket) return { ok: false, erro: 'Não consegui abrir a conexão com o WhatsApp.' };
    // Sessão que já tem credencial não pede código: ela só precisa reconectar.
    if (socket.authState.creds.registered) return { ok: true, jaPareado: true };

    // O socket acabou de nascer; o pedido do código é um nó enviado pela
    // websocket, que ainda está subindo. Sem esta espera o pedido sai antes da
    // conexão existir e estoura "Connection Closed".
    await new Promise((resolve) => setTimeout(resolve, 4_000));

    const codigo = await socket.requestPairingCode(numeroAutorizado());
    ponte.codigoPareamento = codigo;
    ponte.ultimoErro = null;
    return { ok: true, codigo };
  } catch (erro) {
    ponte.ultimoErro = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: ponte.ultimoErro };
  }
}

export function situacaoWhatsapp(): {
  configurado: boolean;
  conectado: boolean;
  precisaParear: boolean;
  codigoPareamento: string | null;
  numeroMascarado: string;
  ultimoErro: string | null;
} {
  const numero = numeroAutorizado();
  return {
    configurado: whatsappConfigurado(),
    conectado: ponte.conectado,
    precisaParear: !ponte.conectado,
    codigoPareamento: ponte.codigoPareamento,
    // O painel mostra só o fim do número: é dado pessoal e a tela fica aberta na
    // mesa. Quem configurou sabe qual é; para os outros, não precisa aparecer.
    numeroMascarado: numero ? `•••• ${numero.slice(-4)}` : '',
    ultimoErro: ponte.ultimoErro,
  };
}
