/**
 * Limite de tentativas de login (anti força bruta).
 *
 * Em memória de propósito: é 1 usuário só e o app roda numa instância. Se um
 * dia houver mais réplicas, isto precisa virar Redis/banco — está anotado.
 */

interface Registro {
  tentativas: number;
  bloqueadoAte: number;
}

const MAX_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;

/**
 * Chave que conta as falhas de TODAS as origens somadas.
 *
 * O limite por IP sozinho não segura quem tem muitos IPs (botnet, ou um proxy
 * que a gente identificou errado). Este teto global é a rede de baixo: mesmo
 * trocando de IP a cada tentativa, o atacante esbarra aqui.
 *
 * É bem mais alto que o limite por IP porque prender cedo demais viraria uma
 * forma de trancar o usuário legítimo de fora. 20 falhas em 15 minutos já não
 * é gente errando a senha — e o bloqueio é temporário, nunca permanente.
 */
const CHAVE_GLOBAL = '__global__';
const MAX_GLOBAL = 20;

const globalMapa = globalThis as unknown as { __rpaTentativas?: Map<string, Registro> };
const mapa: Map<string, Registro> = (globalMapa.__rpaTentativas ??= new Map());

export interface EstadoLimite {
  bloqueado: boolean;
  restantes: number;
  segundosParaLiberar: number;
}

function tetoDe(chave: string): number {
  return chave === CHAVE_GLOBAL ? MAX_GLOBAL : MAX_TENTATIVAS;
}

function checarUma(chave: string, agora: number): EstadoLimite {
  const teto = tetoDe(chave);
  const r = mapa.get(chave);
  if (!r) return { bloqueado: false, restantes: teto, segundosParaLiberar: 0 };

  if (r.bloqueadoAte > agora) {
    return {
      bloqueado: true,
      restantes: 0,
      segundosParaLiberar: Math.ceil((r.bloqueadoAte - agora) / 1000),
    };
  }

  // Bloqueio expirou: zera.
  if (r.bloqueadoAte !== 0 && r.bloqueadoAte <= agora) {
    mapa.delete(chave);
    return { bloqueado: false, restantes: teto, segundosParaLiberar: 0 };
  }

  return {
    bloqueado: false,
    restantes: Math.max(0, teto - r.tentativas),
    segundosParaLiberar: 0,
  };
}

/**
 * Estado do limite para esta origem. Bloqueia se a origem estourou o teto dela
 * OU se o total geral estourou — quem passa por qualquer um dos dois, para.
 */
export function checarLimite(chave: string, agora = Date.now()): EstadoLimite {
  const daOrigem = checarUma(chave, agora);
  if (chave === CHAVE_GLOBAL) return daOrigem;

  const global = checarUma(CHAVE_GLOBAL, agora);
  if (global.bloqueado && !daOrigem.bloqueado) return global;
  return daOrigem;
}

/** Registra falha na origem e no total geral. */
export function registrarFalha(chave: string, agora = Date.now()): EstadoLimite {
  for (const k of chave === CHAVE_GLOBAL ? [CHAVE_GLOBAL] : [chave, CHAVE_GLOBAL]) {
    const r = mapa.get(k) ?? { tentativas: 0, bloqueadoAte: 0 };
    r.tentativas += 1;
    if (r.tentativas >= tetoDe(k)) r.bloqueadoAte = agora + JANELA_MS;
    mapa.set(k, r);
  }
  return checarLimite(chave, agora);
}

/**
 * Login bem-sucedido zera o contador desta origem — e também o geral: se
 * alguém acertou a senha, o pico de falhas não era ataque em andamento, e
 * manter o bloqueio geral só atrapalharia quem é de casa.
 */
export function limparTentativas(chave: string): void {
  mapa.delete(chave);
  mapa.delete(CHAVE_GLOBAL);
}

/** Só para testes. */
export function resetarLimites(): void {
  mapa.clear();
}
