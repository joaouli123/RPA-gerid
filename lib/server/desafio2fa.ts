/**
 * Desafio de autenticação em duas etapas do GERID.
 *
 * O robô não guarda a semente do Google Authenticator: quem lê os 6 dígitos é
 * sempre o operador, no celular dele. Este módulo é só o encontro entre o
 * pedido do robô e a resposta que chega pelo WhatsApp — um cofre de curtíssima
 * duração, em memória, que esquece o código assim que ele é usado.
 *
 * Regras que não são negociáveis, porque são elas que impedem alguém de entrar
 * no lugar do procurador:
 *
 * 1. Um código só vale se o PRÓPRIO robô tiver aberto um desafio antes.
 * 2. O desafio expira em 2 minutos (o TOTP dura menos que isso mesmo).
 * 3. O código é entregue UMA vez e apagado — não sobra pra uma segunda leitura.
 * 4. O código nunca é escrito em log, nem em disco.
 */

/** Janela em que um código respondido pelo WhatsApp ainda serve. */
const VALIDADE_MS = 2 * 60 * 1000;

interface Desafio {
  id: string;
  criadoEm: number;
  /** Só existe entre a resposta do operador e a leitura do robô. */
  codigo?: string;
  /** Preenchido quando o robô consome — evita reentrega em retry de rede. */
  consumidoEm?: number;
}

/**
 * O socket do WhatsApp e o desafio vivem no mesmo processo Node da VPS. Em dev
 * o Next recarrega os módulos, então o estado mora no globalThis para não
 * nascer um desafio órfão a cada hot reload.
 */
const chave = Symbol.for('rpa-gerid.desafio2fa');
const raiz = globalThis as unknown as Record<symbol, { atual?: Desafio } | undefined>;
raiz[chave] ??= {};
const estado = raiz[chave]!;

function expirado(desafio: Desafio, agora = Date.now()): boolean {
  return agora - desafio.criadoEm > VALIDADE_MS;
}

/**
 * O robô avisa que travou na tela dos 6 dígitos.
 *
 * Se já existe um desafio recente e ainda sem resposta, devolvemos o mesmo:
 * um retry do robô não pode invalidar o código que o operador já está digitando.
 */
export function abrirDesafio(): Desafio {
  const atual = estado.atual;
  if (atual && !expirado(atual) && !atual.codigo && !atual.consumidoEm) {
    return atual;
  }
  const desafio: Desafio = {
    id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: Date.now(),
  };
  estado.atual = desafio;
  return desafio;
}

export type ResultadoResposta =
  | { ok: true; id: string }
  | { ok: false; motivo: 'sem_pedido' | 'expirado' | 'ja_respondido' };

/**
 * Chega uma mensagem do número autorizado com 6 dígitos.
 *
 * `sem_pedido` é o caso que interessa vigiar: código que ninguém pediu significa
 * que alguém está tentando entrar, ou que o operador mandou fora de hora.
 */
export function responderDesafio(codigo: string): ResultadoResposta {
  const atual = estado.atual;
  if (!atual || atual.consumidoEm) return { ok: false, motivo: 'sem_pedido' };
  if (expirado(atual)) return { ok: false, motivo: 'expirado' };
  if (atual.codigo) return { ok: false, motivo: 'ja_respondido' };
  atual.codigo = codigo;
  return { ok: true, id: atual.id };
}

/**
 * O robô busca o código do desafio que ele mesmo abriu.
 *
 * Devolve `null` enquanto o operador não respondeu — o robô fica em polling.
 * Depois de entregue, o código some da memória.
 */
export function consumirCodigo(id: string): string | null {
  const atual = estado.atual;
  if (!atual || atual.id !== id || expirado(atual) || !atual.codigo) return null;
  const codigo = atual.codigo;
  delete atual.codigo;
  atual.consumidoEm = Date.now();
  return codigo;
}

/** Estado do desafio corrente, sem nunca revelar o código. */
export function situacaoDesafio(): {
  id: string | null;
  aguardando: boolean;
  respondido: boolean;
  segundosRestantes: number;
} {
  const atual = estado.atual;
  if (!atual || expirado(atual)) {
    return { id: null, aguardando: false, respondido: false, segundosRestantes: 0 };
  }
  return {
    id: atual.id,
    aguardando: !atual.codigo && !atual.consumidoEm,
    respondido: Boolean(atual.codigo),
    segundosRestantes: Math.max(
      0,
      Math.ceil((VALIDADE_MS - (Date.now() - atual.criadoEm)) / 1000),
    ),
  };
}
