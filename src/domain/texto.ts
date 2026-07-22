/**
 * Helpers de normalizacao de texto — usados em todo lugar onde comparamos
 * strings que vem de fontes "sujas" (nomes de arquivo, cabecalhos de planilha,
 * nomes de pasta). Centralizar aqui evita divergencia entre modulos.
 */

const DIACRITICOS = /[̀-ͯ]/g;

/** Remove acentos/diacriticos (ex.: "Representacao" com cedilha -> "Representacao"). */
export function removerAcentos(s: string): string {
  // ̀-ͯ = bloco de marcas diacriticas combinantes (Unicode).
  return s.normalize('NFD').replace(DIACRITICOS, '');
}

/** Minusculas + sem acento + trim. Base de quase toda comparacao textual. */
export function normalizar(s: string | undefined | null): string {
  return removerAcentos((s ?? '').toString().trim().toLowerCase());
}

/**
 * Normaliza cabecalhos de planilha para casar com o mapeamento configuravel.
 * Trata "_" e espacos como equivalentes, entao "CPF_Requerente",
 * "cpf requerente" e "CPF  Requerente" viram todos "cpf requerente".
 */
export function normalizarCabecalho(s: string | undefined | null): string {
  return normalizar(s).replace(/[_\s]+/g, ' ').trim();
}

/** So os digitos (para comparar CPF/CEP independente de mascara). */
export function apenasDigitos(s: string | undefined | null): string {
  return (s ?? '').toString().replace(/\D+/g, '');
}

/**
 * Devolve o CPF com 11 digitos.
 *
 * Planilha que guarda CPF como NUMERO perde o zero a esquerda: o CPF
 * 09876543210 vira 9876543210 (10 digitos) e passa a ser invalido. Aqui a
 * gente recompoe o zero quando o valor claramente foi truncado assim.
 */
export function padronizarCpf(s: string | undefined | null): string {
  const digitos = apenasDigitos(s);
  if (digitos.length === 0) return '';
  if (digitos.length >= 8 && digitos.length < 11) return digitos.padStart(11, '0');
  return digitos;
}
