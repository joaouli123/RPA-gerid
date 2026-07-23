/**
 * De quem veio a requisição — usado como chave do limite de tentativas.
 *
 * ⚠️ O ponto todo deste arquivo é NÃO confiar no que o cliente manda.
 *
 * `X-Forwarded-For` é uma lista que cresce da esquerda para a direita:
 * cada proxy ANEXA quem falou com ele. Se o cliente já manda o header,
 * o valor dele fica na PONTA ESQUERDA e o IP real entra depois:
 *
 *     X-Forwarded-For: <o que o atacante inventou>, <IP real visto pela borda>
 *
 * Por isso pegar o primeiro item é furado: quem ataca troca esse valor a cada
 * tentativa, cai numa chave nova toda vez e nunca é bloqueado. O item da
 * DIREITA é o único que um proxy escreveu, então é dele que a gente parte.
 *
 * Melhor ainda: headers de valor único que o proxy SOBRESCREVE a cada salto
 * (o Railway roda Envoy, que preenche `x-envoy-external-address`). Esses vêm
 * primeiro na ordem de preferência.
 *
 * Quando não dá para identificar, todo mundo cai na mesma chave — falha para
 * o lado seguro (bloqueia demais, nunca de menos).
 */

/** Chave usada quando não há como saber a origem. Compartilhada de propósito. */
export const ORIGEM_DESCONHECIDA = 'desconhecido';

type LerCabecalho = (nome: string) => string | null | undefined;

/**
 * Headers de valor único escritos pelo proxy da frente. Cada um é
 * sobrescrito a cada salto, então o cliente não consegue plantar valor.
 */
const CABECALHOS_DE_PROXY = [
  'x-envoy-external-address', // Envoy (Railway)
  'cf-connecting-ip', // Cloudflare
  'true-client-ip', // Akamai / Cloudflare Enterprise
  'x-real-ip', // nginx e afins
];

export function derivarOrigem(ler: LerCabecalho): string {
  for (const nome of CABECALHOS_DE_PROXY) {
    const valor = ler(nome)?.trim();
    if (valor) return valor;
  }

  // Sobrou o X-Forwarded-For: vale o item mais à direita, o único que um
  // proxy escreveu. O resto da lista o cliente pode ter inventado.
  const encaminhado = ler('x-forwarded-for');
  if (encaminhado) {
    const itens = encaminhado
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const ultimo = itens.at(-1);
    if (ultimo) return ultimo;
  }

  return ORIGEM_DESCONHECIDA;
}
