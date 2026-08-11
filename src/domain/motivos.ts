/**
 * Motivos tipados pelos quais um caso cai em REVISÃO MANUAL.
 * Esta é a fonte única de verdade que alimenta:
 *   - o relatório do Módulo 3 (sucesso x revisão)
 *   - a skill/checklist de "diagnóstico de falha"
 * Mantenha em sincronia com docs/checklists/diagnostico-falha.md.
 */

export const CodigoMotivo = {
  /** Falta um dos 5 documentos obrigatórios na pasta. */
  DOCUMENTO_FALTANDO: 'DOCUMENTO_FALTANDO',
  /** Um anexo excede o limite de tamanho aceito pelo Gerid. */
  ARQUIVO_GRANDE_DEMAIS: 'ARQUIVO_GRANDE_DEMAIS',
  /** A soma dos anexos excede o limite total aceito pelo Gerid. */
  ANEXOS_TOTAL_GRANDE_DEMAIS: 'ANEXOS_TOTAL_GRANDE_DEMAIS',
  /** Existe pasta no Drive sem linha correspondente na planilha. */
  PASTA_SEM_LINHA_PLANILHA: 'PASTA_SEM_LINHA_PLANILHA',
  /** Existe linha na planilha sem pasta correspondente no Drive. */
  LINHA_SEM_PASTA: 'LINHA_SEM_PASTA',
  /** Campos obrigatórios do requerente faltando/ inválidos. */
  DADOS_INCOMPLETOS: 'DADOS_INCOMPLETOS',
  /** Cliente sem nenhum integrante de grupo familiar na planilha. */
  GRUPO_FAMILIAR_AUSENTE: 'GRUPO_FAMILIAR_AUSENTE',
  /** Grupo familiar existe mas viola uma invariante (ver validarGrupoFamiliar). */
  GRUPO_FAMILIAR_INVALIDO: 'GRUPO_FAMILIAR_INVALIDO',
} as const;

export type CodigoMotivo = (typeof CodigoMotivo)[keyof typeof CodigoMotivo];

export interface MotivoRevisao {
  codigo: CodigoMotivo;
  /** Mensagem legível para humano (aparece no relatório). */
  detalhe: string;
  /** Dados estruturados do motivo (ex.: qual documento, qual arquivo/tamanho). */
  contexto?: Record<string, unknown>;
}

export function motivo(
  codigo: CodigoMotivo,
  detalhe: string,
  contexto?: Record<string, unknown>,
): MotivoRevisao {
  return contexto ? { codigo, detalhe, contexto } : { codigo, detalhe };
}
