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

const globalMapa = globalThis as unknown as { __rpaTentativas?: Map<string, Registro> };
const mapa: Map<string, Registro> = (globalMapa.__rpaTentativas ??= new Map());

export interface EstadoLimite {
  bloqueado: boolean;
  restantes: number;
  segundosParaLiberar: number;
}

export function checarLimite(chave: string, agora = Date.now()): EstadoLimite {
  const r = mapa.get(chave);
  if (!r) return { bloqueado: false, restantes: MAX_TENTATIVAS, segundosParaLiberar: 0 };

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
    return { bloqueado: false, restantes: MAX_TENTATIVAS, segundosParaLiberar: 0 };
  }

  return {
    bloqueado: false,
    restantes: Math.max(0, MAX_TENTATIVAS - r.tentativas),
    segundosParaLiberar: 0,
  };
}

/** Registra falha. Ao atingir o limite, bloqueia a chave por 15 min. */
export function registrarFalha(chave: string, agora = Date.now()): EstadoLimite {
  const r = mapa.get(chave) ?? { tentativas: 0, bloqueadoAte: 0 };
  r.tentativas += 1;
  if (r.tentativas >= MAX_TENTATIVAS) r.bloqueadoAte = agora + JANELA_MS;
  mapa.set(chave, r);
  return checarLimite(chave, agora);
}

/** Login bem-sucedido zera o contador. */
export function limparTentativas(chave: string): void {
  mapa.delete(chave);
}

/** Só para testes. */
export function resetarLimites(): void {
  mapa.clear();
}
