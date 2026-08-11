/**
 * Extrai um protocolo somente quando ele aparece associado a um rotulo
 * inequivoco da tela final. Numeros soltos, CPF e CEP nunca sao aceitos.
 */
export function detectarProtocoloEmTexto(texto: string): string | null {
  const normalizado = String(texto || '').replace(/\s+/g, ' ').trim();
  const padroes = [
    /(?:n[uú]mero\s+d[oe]\s+)?protocolo\s*(?:gerado)?\s*[:#-]?\s*([0-9][0-9.\/-]{7,30})/i,
    /(?:n[uú]mero\s+d[oe]\s+)?requerimento\s*[:#-]\s*([0-9][0-9.\/-]{7,30})/i,
    /(?:n[uú]mero\s+d[oe]\s+)?pedido\s*[:#-]\s*([0-9][0-9.\/-]{7,30})/i,
  ];

  for (const padrao of padroes) {
    const encontrado = normalizado.match(padrao)?.[1];
    if (!encontrado) continue;
    const digitos = encontrado.replace(/\D/g, '');
    if (digitos.length >= 8 && digitos.length <= 25) return encontrado.replace(/[.,;:]+$/, '');
  }
  return null;
}
