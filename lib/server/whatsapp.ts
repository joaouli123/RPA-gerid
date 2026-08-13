import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { promises as fs } from 'node:fs';
import path from 'node:path';
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

/**
 * Só os dígitos do "user" de um JID.
 *
 * `5541999999999@s.whatsapp.net` -> `5541999999999`
 * `5541999999999:88@s.whatsapp.net` -> `5541999999999` (o `:88` é o aparelho)
 */
function usuarioDoJid(jid: string | null | undefined): string {
  return String(jid || '').split('@')[0]!.split(':')[0]!.replace(/\D/g, '');
}

/**
 * O JID canônico do operador, PERGUNTADO ao WhatsApp — nunca montado no chute.
 *
 * Isto já foi `${numero}@s.whatsapp.net`, e o custo foi alto: o WhatsApp guarda
 * celular brasileiro de DDD >= 31 SEM o nono dígito. O log do próprio servidor
 * mostra isso na conta pareada — `myPN: 554199077637`, doze dígitos. Então o
 * número (41) 98703-8339 mora lá como `554187038339`, e a mensagem endereçada a
 * `5541987038339@s.whatsapp.net` ia para um destinatário que não existe.
 *
 * O pior não foi errar o endereço: foi errar em silêncio. `sendMessage` aceita
 * qualquer JID e não reclama, então o servidor respondia "avisei o operador",
 * a extensão anunciava "pedi o codigo no seu WhatsApp", e o celular não tocava.
 * Todo mundo achando que tinha feito a sua parte.
 *
 * `onWhatsApp` devolve o endereço que o WhatsApp reconhece e diz se a conta
 * existe. Quando não existe, isto ESTOURA — quem falha alto vira erro na tela
 * do operador ("digite o código você mesmo") em vez de virar espera muda.
 */
async function jidDoOperador(socket: WASocket): Promise<string> {
  const numero = numeroAutorizado();
  if (ponte.jidOperador && usuarioDoJid(ponte.jidOperador)) return ponte.jidOperador;

  const achados = await socket.onWhatsApp(numero).catch(() => undefined);
  const encontrado = achados?.find((c) => c.exists);
  if (!encontrado?.jid) {
    throw new Error(
      `O número ${numero} não tem conta de WhatsApp (ou o WhatsApp não respondeu a consulta). `
      + 'Confira RPA_WHATSAPP_NUMERO: precisa de DDI + DDD + número.',
    );
  }

  ponte.jidOperador = encontrado.jid;
  // O que o WhatsApp devolveu é o endereço bom; o que está no .env é o que o
  // humano digitou. Os dois valem para RECONHECER uma resposta, porque a
  // mensagem que chega pode vir com qualquer um dos dois formatos.
  ponte.usuariosOperador.add(usuarioDoJid(encontrado.jid));
  ponte.usuariosOperador.add(numero);
  if (usuarioDoJid(encontrado.jid) !== numero) {
    console.log(
      `[WhatsApp] O WhatsApp conhece ${numero} como ${usuarioDoJid(encontrado.jid)}. Usando o dele.`,
    );
  }
  return encontrado.jid;
}

interface Ponte {
  socket: WASocket | null;
  conectando: Promise<void> | null;
  conectado: boolean;
  /** Último QR gerado, para o operador parear pela tela de configurações. */
  qr: string | null;
  ultimoErro: string | null;
  /**
   * Ids das mensagens que o PRÓPRIO robô mandou.
   *
   * Existe por causa da conversa do número consigo mesmo ("Mensagem para mim
   * mesmo"): lá o que o robô envia e o que o operador digita chegam os dois com
   * `fromMe: true` e o mesmo `remoteJid`. Não dá para separar um do outro pela
   * mensagem — só sabendo quais ids saíram daqui.
   */
  enviadas: Set<string>;
  /** Quantas reconexões seguidas falharam — dita a espera da próxima. */
  tentativas: number;
  /** Reconexão já marcada. Evita duas filas de retentativa correndo juntas. */
  religarEm: ReturnType<typeof setTimeout> | null;
  /** A sessão chegou a parear alguma vez. Sessão pareada insiste; sessão nova não. */
  registrada: boolean;
  /** O operador desvinculou no celular. Insistir aqui é gastar VPS à toa. */
  desvinculado: boolean;
  /**
   * Qual conexão é a atual.
   *
   * Sobe a cada socket novo. Evento que chega de um socket já substituído é
   * descartado por este número — sem isso, o `close` de uma conexão velha apaga
   * o QR que a conexão nova acabou de publicar.
   */
  geracao: number;
  /**
   * JID canônico do operador, como o WhatsApp o conhece. Resolvido uma vez por
   * conexão (ver `jidDoOperador`) e zerado a cada socket novo — se a sessão
   * trocou de conta pareada, o endereço resolvido pela anterior não vale mais.
   */
  jidOperador: string | null;
  /**
   * Todos os "users" que contam como sendo o operador: o do `.env`, o que o
   * WhatsApp devolveu, e o `@lid` dele quando aparecer. Existe porque a mesma
   * pessoa chega com endereços diferentes conforme o caminho da mensagem, e
   * quem responde os 6 dígitos precisa ser reconhecido em todos eles.
   */
  usuariosOperador: Set<string>;
}

/**
 * Espera antes de cada nova tentativa, em ms.
 *
 * Cresce porque o motivo mais comum de queda é a internet do servidor oscilando,
 * e martelar o WhatsApp de 3 em 3 segundos durante uma queda longa é justamente
 * o comportamento que faz a Meta olhar torto para um cliente não-oficial.
 */
const ESPERAS_RECONEXAO = [3_000, 5_000, 10_000, 20_000, 30_000, 60_000];

/**
 * Espera entre tentativas enquanto NINGUÉM pareou ainda.
 *
 * Fixa e curta porque a situação é outra: aqui existe uma pessoa parada na
 * frente da tela esperando um QR aparecer. Fazê-la esperar 60s pelo código
 * seguinte é o mesmo que não mostrar código nenhum. Depois de pareado, a
 * conexão volta sozinha e a escada de esperas acima é que vale.
 */
const ESPERA_ANTES_DE_PAREAR = 3_000;

/**
 * Quantas vezes tentar quando a sessão AINDA não pareou.
 *
 * Pareada, a ponte reconecta para sempre — é isso que "sempre conectado"
 * significa. Não pareada, insistir gera QR para uma tela que ninguém está
 * olhando; melhor parar e esperar alguém clicar.
 */
const LIMITE_SEM_PAREAR = 5;

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
  enviadas: new Set(),
  tentativas: 0,
  religarEm: null,
  registrada: false,
  desvinculado: false,
  geracao: 0,
  jidOperador: null,
  usuariosOperador: new Set(),
};
const ponte = raiz[chave]!;
// Uma ponte que sobreviveu ao hot reload pode ter sido criada por uma versão
// anterior deste arquivo, sem os campos novos.
ponte.enviadas ??= new Set();
ponte.tentativas ??= 0;
ponte.religarEm ??= null;
ponte.registrada ??= false;
ponte.desvinculado ??= false;
ponte.geracao ??= 0;
ponte.jidOperador ??= null;
ponte.usuariosOperador ??= new Set();

/**
 * A pasta da sessão guarda uma credencial que REALMENTE pareou?
 *
 * Não basta o arquivo existir. O Baileys grava `creds.json` durante o
 * handshake, antes de alguém apontar a câmera — então um pareamento que começou
 * e não terminou deixa o arquivo lá, com `registered: false`. Como só se olhava
 * a existência, o servidor se declarava pareado, a tela mostrava "vinculado •
 * reconectando" e nunca mais pedia QR. Trava calada, e com volume persistente
 * nenhum deploy limpa: o arquivo ruim fica.
 *
 * `registered` é o campo que o próprio Baileys usa para dizer que o aparelho
 * está do outro lado.
 */
async function sessaoJaPareada(): Promise<boolean> {
  try {
    const bruto = await fs.readFile(path.join(pastaSessao(), 'creds.json'), 'utf8');
    return (JSON.parse(bruto) as { registered?: boolean }).registered === true;
  } catch {
    // Sem arquivo, ilegível ou meio gravado: tratar como "nunca pareou" é o
    // lado seguro — no pior caso mostra um QR a mais, em vez de esconder o QR
    // de quem precisa dele.
    return false;
  }
}

/** Marca a próxima tentativa, com espera crescente. Uma de cada vez. */
function agendarReconexao(): void {
  if (ponte.religarEm || ponte.desvinculado) return;
  const espera = ponte.registrada
    ? ESPERAS_RECONEXAO[Math.min(ponte.tentativas, ESPERAS_RECONEXAO.length - 1)]!
    : ESPERA_ANTES_DE_PAREAR;
  ponte.tentativas += 1;
  ponte.religarEm = setTimeout(() => {
    ponte.religarEm = null;
    void garantirConexao().catch(() => agendarReconexao());
  }, espera);
  // `unref` para o processo poder encerrar sem esperar este timer.
  ponte.religarEm.unref?.();
}

/**
 * Religa uma sessão já pareada que esteja fora do ar.
 *
 * Sem isto, a ponte só subia quando alguém precisava dela — ou seja, no momento
 * em que o GERID pedia o 2FA, que é o pior momento possível para descobrir que a
 * conexão caiu. Pior: depois de todo deploy o painel mostrava "não vinculado"
 * mesmo com a sessão inteira salva em disco, e dava a impressão de que o
 * pareamento tinha se perdido.
 *
 * Chamada a cada consulta de status, que é o que a tela de configurações já faz
 * de segundos em segundos. Barata: sai na hora se já estiver conectada ou se já
 * houver tentativa em andamento.
 *
 * Devolve promessa porque quem consulta o status precisa esperar por ela: o
 * único trabalho aqui é ler se existe credencial em disco, e é isso que separa
 * "precisa de alguém com o celular" de "já é pareado, está só voltando". Sem o
 * `await`, a primeira consulta depois de um restart respondia "não vinculado" e
 * a tela mostrava um QR que ninguém precisava escanear. A conexão em si NÃO é
 * esperada — essa demora, e a resposta não pode esperar por ela.
 */
export async function manterConexaoViva(): Promise<void> {
  if (!whatsappConfigurado()) return;
  if (ponte.conectado || ponte.conectando || ponte.religarEm || ponte.desvinculado) return;
  if (!(await sessaoJaPareada())) return;
  ponte.registrada = true;
  void garantirConexao().catch(() => agendarReconexao());
}

/**
 * Envia e anota o id, para não confundir o eco da própria mensagem com resposta
 * do operador. Guarda só as últimas: o robô manda pouca coisa, e um Set que
 * cresce para sempre num processo que fica meses no ar é vazamento.
 */
async function enviarTexto(socket: WASocket, texto: string): Promise<void> {
  const enviada = await socket.sendMessage(await jidDoOperador(socket), { text: texto });
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
  key: {
    remoteJid?: string | null;
    remoteJidAlt?: string | null;
    fromMe?: boolean | null;
    id?: string | null;
  },
  usuariosAutorizados: Set<string>,
  enviadasPeloRobo: Set<string>,
): boolean {
  // Um JID de grupo termina em @g.us. Só conversa direta com o número
  // autorizado vale — em grupo qualquer participante poderia responder.
  if (String(key.remoteJid || '').endsWith('@g.us')) return false;

  // Comparar a string inteira do JID não serve mais. A mesma pessoa chega ora
  // como `numero@s.whatsapp.net`, ora como `numero:88@s.whatsapp.net` (o sufixo
  // é o aparelho), ora como `id@lid` no endereçamento novo do WhatsApp — e aí o
  // número real vem no `remoteJidAlt`. Igualdade crua descartava a resposta do
  // operador em silêncio, que é o modo de falhar mais caro que existe aqui.
  //
  // O que NÃO se afrouxa: o número precisa bater. Este teste é o que decide de
  // quem o robô aceita 6 dígitos para entrar no GERID; um `@lid` que não se
  // resolve em número conhecido não passa.
  const candidatos = [usuarioDoJid(key.remoteJid), usuarioDoJid(key.remoteJidAlt)];
  if (!candidatos.some((u) => u && usuariosAutorizados.has(u))) return false;
  // Aqui NÃO se descarta por `fromMe`. Quando o robô usa o mesmo número do
  // operador, a conversa é a dele consigo mesmo, e tudo que ele digita vem
  // marcado como "minha mensagem" — jogar fora por isso cortaria justamente a
  // resposta que estamos esperando. O que precisa ser ignorado é só o eco do
  // que saiu daqui, e disso guardamos o id.
  if (key.fromMe && key.id && enviadasPeloRobo.has(key.id)) return false;
  return true;
}

async function tratarMensagem(socket: WASocket, mensagem: {
  key: {
    remoteJid?: string | null;
    remoteJidAlt?: string | null;
    fromMe?: boolean | null;
    id?: string | null;
  };
  message?: Parameters<typeof textoDaMensagem>[0]['message'];
}) {
  // Garante que o conjunto de autorizados já tem o endereço canônico. Sem isto,
  // uma resposta que chegue ANTES do primeiro envio (o operador respondendo a
  // uma mensagem antiga) seria comparada contra um conjunto vazio.
  await jidDoOperador(socket).catch(() => undefined);
  if (!ehRespostaDoOperador(mensagem.key, ponte.usuariosOperador, ponte.enviadas)) return;

  // Aprendido do próprio WhatsApp: se a mensagem veio endereçada por `@lid` e o
  // `remoteJidAlt` provou ser o número autorizado, esse `@lid` é o operador. A
  // associação não é adivinhada — veio no mesmo pacote.
  const lid = String(mensagem.key.remoteJid || '');
  if (lid.endsWith('@lid') && usuarioDoJid(lid)) ponte.usuariosOperador.add(usuarioDoJid(lid));

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
  // A versão do WhatsApp Web é buscada na internet. Quando o servidor não
  // alcança a origem, o Baileys cai numa versão embutida — e versão velha
  // demais o WhatsApp simplesmente recusa, sem dizer por quê. Fica no log
  // porque é o primeiro lugar a olhar quando a conexão morre antes do QR.
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(
    `[WhatsApp] Versão do WhatsApp Web: ${version.join('.')}`
    + `${isLatest ? '' : ' (embutida — não consegui consultar a atual)'}`,
  );

  // Credencial em disco quer dizer que este número já foi pareado um dia — a
  // ponte passa a insistir na reconexão em vez de desistir depois de 5 quedas.
  if (state.creds.registered) ponte.registrada = true;

  // O socket anterior sai de cena ANTES de abrir outro.
  //
  // Era daqui que vinha o "Preparando o QR code..." eterno: cada tentativa
  // abria mais uma conexão sem encerrar a de antes, e quando a velha caía —
  // segundos depois — o `close` dela zerava o `ponte.qr` que a NOVA tinha
  // acabado de publicar. Quanto mais o operador clicava, mais sockets vivos, e
  // menos chance de um QR sobreviver até a tela buscar. O contador de geração é
  // o que faz o evento atrasado ser ignorado em vez de apagar o estado bom.
  const anterior = ponte.socket;
  const geracao = ++ponte.geracao;
  ponte.socket = null;
  ponte.conectado = false;
  // O endereço canônico foi resolvido POR uma conexão; conexão nova pode estar
  // pareada com outra conta. Guardar o endereço antigo mandaria a mensagem para
  // o destinatário de ontem — e de novo sem erro nenhum aparecendo.
  ponte.jidOperador = null;
  try {
    anterior?.end(undefined);
  } catch {
    // Já estava morto: é exatamente o que se queria.
  }

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

  /**
   * Esta conexão chegou a produzir algum QR?
   *
   * É o que separa o ciclo normal do defeito. QR do WhatsApp expira e derruba a
   * conexão junto — isso é rotina, e avisar disso só assusta quem está com o
   * celular na mão. Já uma conexão que morre SEM nunca ter mostrado um código é
   * sempre anormal: não chegou nem a começar. Nesse caso a tela tem que dizer o
   * motivo, senão fica repetindo "Gerando um QR code novo..." para sempre sobre
   * uma falha que ninguém consegue enxergar.
   */
  let houveQr = false;

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (atualizacao) => {
    // Conexão que já foi substituída não mexe mais no estado de ninguém.
    if (geracao !== ponte.geracao) return;
    if (atualizacao.qr) {
      houveQr = true;
      ponte.qr = atualizacao.qr;
      console.log('[WhatsApp] Leia o QR code para parear o número do robô.');
    }
    if (atualizacao.connection === 'open') {
      ponte.conectado = true;
      ponte.qr = null;
      ponte.ultimoErro = null;
      // Conectou: a contagem de falhas volta a zero, senão a primeira queda
      // depois de semanas no ar já cairia direto no intervalo de 60s.
      ponte.tentativas = 0;
      ponte.registrada = true;
      ponte.desvinculado = false;
      console.log('[WhatsApp] Conectado.');
    }
    if (atualizacao.connection === 'close') {
      ponte.conectado = false;
      ponte.socket = null;
      ponte.conectando = null;
      // QR de conexão morta não serve para nada, e deixá-lo na tela faz o
      // operador escanear um código que o WhatsApp já descartou.
      ponte.qr = null;
      const erroFechamento = atualizacao.lastDisconnect?.error as
        { output?: { statusCode?: number }; message?: string } | undefined;
      const causa = erroFechamento?.output?.statusCode;
      // Fechamento SEM código não veio do protocolo do WhatsApp — veio da rede
      // do servidor (DNS, TLS, socket cortado). "código desconhecido" não dá a
      // ninguém o que fazer; a mensagem do erro dá. É a diferença entre o
      // operador conseguir dizer o que aconteceu e só saber que não funcionou.
      const detalhe = causa
        ? `código ${causa}`
        : (erroFechamento?.message?.trim() || 'motivo desconhecido');
      // `loggedOut` = o operador desvinculou o aparelho. Reconectar em laço só
      // gastaria a VPS; é preciso ler o QR de novo.
      if (causa === DisconnectReason.loggedOut) {
        ponte.desvinculado = true;
        ponte.registrada = false;
        ponte.ultimoErro = 'Sessão encerrada no celular. É preciso parear de novo pelo QR code.';
        console.log(`[WhatsApp] ${ponte.ultimoErro}`);
        return;
      }
      // Sessão que nunca pareou não fica tentando para sempre: o QR só vale se
      // alguém estiver na frente da tela, e ninguém está às 3h da manhã.
      if (!ponte.registrada && ponte.tentativas >= LIMITE_SEM_PAREAR) {
        ponte.ultimoErro =
          `Não consegui gerar o QR code (${detalhe}). Clique em "Gerar QR code" para tentar de novo.`;
        console.log(`[WhatsApp] ${ponte.ultimoErro}`);
        return;
      }
      // O código do fechamento vai para o log SEMPRE — é o que diagnostica. Mas
      // quem está com o celular na mão esperando um QR não tem o que fazer com
      // "código desconhecido": o QR do WhatsApp expira sozinho e derrubar a
      // conexão faz parte do ciclo normal. Para essa pessoa a frase honesta é
      // que outro código está vindo.
      if (ponte.registrada) {
        ponte.ultimoErro = `Conexão caiu (${detalhe}). Reconectando...`;
      } else if (houveQr) {
        // Ciclo normal: o código apareceu, ninguém escaneou a tempo, vem outro.
        ponte.ultimoErro = 'Gerando um QR code novo...';
      } else {
        // Morreu antes de mostrar código nenhum. Isso nunca é rotina.
        ponte.ultimoErro = `Não consegui abrir a conexão com o WhatsApp: ${detalhe}`;
      }
      console.log(`[WhatsApp] ${ponte.ultimoErro} (${detalhe})`);
      agendarReconexao();
    }
  });

  socket.ev.on('messages.upsert', ({ messages }) => {
    if (geracao !== ponte.geracao) return;
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

/**
 * Devolve o MOTIVO da falha, não só um `false`.
 *
 * A rota do 2FA respondia sempre "Não consegui falar com o WhatsApp do
 * operador", e essa frase cabe em causas muito diferentes — número inexistente,
 * sessão caída, servidor sem internet. O operador lia a mesma linha para todas
 * e não tinha o que fazer com ela. A causa já existia aqui dentro; só não
 * chegava até quem podia agir.
 */
export async function avisarOperador(texto: string): Promise<{ ok: boolean; erro?: string }> {
  if (!whatsappConfigurado()) {
    return { ok: false, erro: 'RPA_WHATSAPP_NUMERO não configurado no servidor.' };
  }
  try {
    await garantirConexao();
    if (!ponte.socket) return { ok: false, erro: 'A ponte do WhatsApp não está conectada.' };
    await enviarTexto(ponte.socket, texto);
    return { ok: true };
  } catch (erro) {
    ponte.ultimoErro = erro instanceof Error ? erro.message : String(erro);
    console.log(`[WhatsApp] Não consegui avisar o operador: ${ponte.ultimoErro}`);
    return { ok: false, erro: ponte.ultimoErro };
  }
}

/**
 * Pede um QR code e VOLTA NA HORA, sem esperar o WhatsApp.
 *
 * Antes esta função era `await` do começo ao fim: subia a conexão, dormia 4s e
 * só então pedia o código. Passava dos 30s do proxy, que devolvia a página
 * "Bad Gateway" — e o painel, esperando JSON, quebrava com "Unexpected token
 * 'B'". O erro não tinha nada a ver com o WhatsApp; era a espera.
 *
 * Agora o trabalho fica em segundo plano e o QR aparece em `situacaoWhatsapp()`,
 * que a tela já consulta de tempos em tempos.
 *
 * Existia também um modo "código de 8 letras" (Conectar com número de telefone).
 * Saiu: eram dois caminhos para o mesmo pareamento, e o segundo pedia 4s de
 * espera antes de virar um número que ainda tinha que ser digitado no celular.
 * Com o celular na mão, apontar a câmera é mais curto — e um caminho só é um
 * caminho que sempre funciona.
 */
export function iniciarPareamento(): { ok: boolean; erro?: string } {
  if (!whatsappConfigurado()) {
    return { ok: false, erro: 'RPA_WHATSAPP_NUMERO não configurado no servidor.' };
  }
  if (ponte.conectado) return { ok: true };

  ponte.ultimoErro = null;

  // Pedido explícito zera a contagem: quem pediu está na frente da tela agora,
  // então nem o limite de tentativas nem o "desvinculado" de uma sessão antiga
  // podem segurar. E se havia retentativa marcada, ela sai da frente — esperar
  // 60s depois de clicar pareceria que o botão não funcionou.
  ponte.tentativas = 0;
  ponte.desvinculado = false;
  if (ponte.religarEm) {
    clearTimeout(ponte.religarEm);
    ponte.religarEm = null;
  }

  void garantirConexao().catch((erro) => {
    ponte.ultimoErro = erro instanceof Error ? erro.message : String(erro);
    console.log(`[WhatsApp] Não consegui gerar o QR code: ${ponte.ultimoErro}`);
    agendarReconexao();
  });

  return { ok: true };
}

export function situacaoWhatsapp(): {
  configurado: boolean;
  conectado: boolean;
  precisaParear: boolean;
  pareado: boolean;
  reconectando: boolean;
  qr: string | null;
  numeroMascarado: string;
  ultimoErro: string | null;
} {
  const numero = numeroAutorizado();
  return {
    configurado: whatsappConfigurado(),
    conectado: ponte.conectado,
    // Cair não é o mesmo que estar solto. `precisaParear` agora quer dizer
    // "precisa de alguém com o celular na frente da tela": uma sessão já pareada
    // que caiu volta sozinha, e mostrar QR nela seria pedir trabalho à toa.
    precisaParear: !ponte.conectado && !ponte.registrada,
    pareado: ponte.registrada,
    reconectando: !ponte.conectado && (ponte.conectando !== null || ponte.religarEm !== null),
    // O QR era capturado e jogado fora: só ia para o log do servidor, onde
    // ninguém que usa o painel consegue apontar a câmera. É o mesmo dado, agora
    // entregue a quem precisa dele. O WhatsApp troca de QR a cada ~20s, e a tela
    // acompanha porque já consulta esta rota em intervalo.
    qr: ponte.qr,
    // O painel mostra só o fim do número: é dado pessoal e a tela fica aberta na
    // mesa. Quem configurou sabe qual é; para os outros, não precisa aparecer.
    numeroMascarado: numero ? `•••• ${numero.slice(-4)}` : '',
    ultimoErro: ponte.ultimoErro,
  };
}
