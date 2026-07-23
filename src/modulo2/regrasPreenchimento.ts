/**
 * REGRAS DE PREENCHIMENTO DO GERID — lógica pura, sem navegador.
 *
 * Aqui moram as decisões que o Fabrício confirmou em 23/07/2026 sobre COMO
 * preencher cada campo. Ficam separadas do Playwright de propósito: assim dá
 * para TESTAR a regra sem abrir navegador, e o robô só executa o que já foi
 * validado aqui. Nada de "chutar" na hora de preencher.
 *
 * Fonte das telas: docs/gerid-fluxo-real.md.
 */

import { ehTitular } from '../domain/grupoFamiliar';
import { normalizar } from '../domain/texto';
import type { GrupoFamiliar, Integrante } from '../domain/types';

/**
 * Respostas que o Fabrício confirmou serem SEMPRE as mesmas (não variam por
 * cliente). O que varia por caso é só o grupo familiar e se mora sozinho —
 * tratados à parte.
 */
export const RESPOSTAS_FIXAS = {
  /** Passo 5. "Gastos com a deficiência negados pelo poder público?" */
  comprometimentoDeRenda: 'Não',
  /** Passo 6. "Proteção Especial SUAS (Centro-Dia) negada?" */
  protecaoEspecialSuas: 'Não',
  /** Passo 7. Aceita acompanhar o processo. */
  acompanhaProcesso: 'Sim',
  /** Passo 7. "Estrangeiro em situação regular?" (a opção vem rotulada "B) Não"). */
  estrangeiro: 'Não',
  /** Passo 7. Não se cadastra representante legal (o procurador é o advogado). */
  representanteLegal: 'Não',
  /** Passo 7. Cadastra procurador (o próprio Fabrício). */
  procurador: 'Sim',
  /** Passo 7. Onde mora. */
  ondeMora: 'Moro em residência',
  /** Passo 7. "Recebe algum benefício?" (a opção vem rotulada "C) Não"). */
  recebeBeneficio: 'Não',
  /** Passo 7. Autoriza desligamento do Bolsa Família se o BPC for aprovado. */
  desligamentoBolsaFamilia: 'Sim',
  /** Passo 7. Autoriza o INSS a alterar a data do pedido para atender requisitos. */
  alterarDataPedido: 'Sim',
} as const;

/**
 * Forma de convívio (passo 7) — a ÚNICA resposta do requerente que varia por
 * caso, derivada do próprio grupo familiar: mora sozinho ou com a família.
 *
 * "Mora sozinho" = o grupo familiar tem só o Titular.
 *
 * ⚠️ VERIFICAR no run supervisionado o rótulo EXATO da opção "sozinho" no
 * GERID (só vimos "Com pessoas da família" nos prints). Por isso o rótulo fica
 * aqui isolado, fácil de corrigir.
 */
export const FORMA_CONVIVIO = {
  comFamilia: 'Com pessoas da família',
  sozinho: 'Sozinho', // VERIFICAR rótulo exato
} as const;

export function formaDeConvivio(grupo: GrupoFamiliar): string {
  const moraSozinho = grupo.integrantes.length <= 1;
  return moraSozinho ? FORMA_CONVIVIO.sozinho : FORMA_CONVIVIO.comFamilia;
}

/**
 * Estado civil de cada integrante (passo 4).
 *
 * Regra do Fabrício: "todo mundo Solteiro por padrão, mesmo quem tem
 * companheiro no CadÚnico. Só muda quando o cliente apresenta certidão de
 * casamento". Então: usa o que estiver na planilha SE fizer sentido; na
 * dúvida ou em branco, Solteiro.
 */
export const ESTADO_CIVIL_PADRAO = 'Solteiro';

/** Opções de estado civil do GERID (rótulos como aparecem no select). */
const ESTADOS_CIVIS_GERID: Record<string, string> = {
  solteiro: 'Solteiro',
  casado: 'Casado',
  viuvo: 'Viúvo',
  divorciado: 'Divorciado',
  'uniao estavel': 'Casado', // GERID não distingue; união estável entra como casado
  separado: 'Divorciado',
};

export function estadoCivilGerid(valorPlanilha?: string): string {
  const chave = normalizar(valorPlanilha);
  if (!chave) return ESTADO_CIVIL_PADRAO;
  return ESTADOS_CIVIS_GERID[chave] ?? ESTADO_CIVIL_PADRAO;
}

/**
 * Grau de parentesco (passo 4): traduz o parentesco fino da planilha para os
 * grupos AGRUPADOS do GERID.
 *
 * Confirmados nos prints: "Pai / Mãe / Padrasto / Madrasta" e "Irmão / Irmã".
 * Os demais rótulos estão marcados VERIFICAR — o robô NÃO deve escolher um
 * grupo que não tenha certeza; se não casar, retorna null e o caso vira
 * pendência (nunca chuta um parentesco errado).
 */
const GRUPOS_PARENTESCO_GERID = {
  paisPadrastos: 'Pai / Mãe / Padrasto / Madrasta',
  irmaos: 'Irmão / Irmã',
  conjuge: 'Cônjuge / Companheiro(a)', // VERIFICAR rótulo exato
  filhos: 'Filho / Filha / Enteado(a)', // VERIFICAR rótulo exato
  avos: 'Avô / Avó', // VERIFICAR rótulo exato
} as const;

const MAPA_PARENTESCO: Array<{ termos: string[]; grupo: string; confirmado: boolean }> = [
  { termos: ['mae', 'pai', 'padrasto', 'madrasta'], grupo: GRUPOS_PARENTESCO_GERID.paisPadrastos, confirmado: true },
  { termos: ['irmao', 'irma'], grupo: GRUPOS_PARENTESCO_GERID.irmaos, confirmado: true },
  { termos: ['conjuge', 'companheir', 'esposa', 'esposo', 'marido'], grupo: GRUPOS_PARENTESCO_GERID.conjuge, confirmado: false },
  { termos: ['filho', 'filha', 'entead'], grupo: GRUPOS_PARENTESCO_GERID.filhos, confirmado: false },
  { termos: ['avo', 'avó'], grupo: GRUPOS_PARENTESCO_GERID.avos, confirmado: false },
];

export interface ParentescoResolvido {
  /** O grupo do GERID a selecionar, ou null se não deu para resolver com segurança. */
  grupo: string | null;
  /** True se o rótulo já foi confirmado nos prints; false = precisa conferir. */
  confirmado: boolean;
}

export function mapearParentesco(parentescoPlanilha: string): ParentescoResolvido {
  const p = normalizar(parentescoPlanilha);

  // O Titular é o próprio requerente — o GERID já o marca como "Requerente".
  if (ehTitular(parentescoPlanilha)) return { grupo: 'Requerente', confirmado: true };

  for (const entrada of MAPA_PARENTESCO) {
    if (entrada.termos.some((t) => p.includes(t))) {
      return { grupo: entrada.grupo, confirmado: entrada.confirmado };
    }
  }
  return { grupo: null, confirmado: false };
}

/**
 * Órgão pagador / unidade (passos 8 e 9): quando o CEP retorna mais de uma
 * agência, escolher a da MESMA CIDADE do cliente — mesmo que a primeira da
 * lista seja de outra cidade (regra do Fabrício).
 *
 * Casa por cidade ignorando acento/caixa. Se nenhuma casar, retorna null: o
 * robô não escolhe uma cidade errada — o caso vira pendência.
 */
export interface OpcaoUnidade {
  nome: string;
  cidade?: string;
  bairro?: string;
  endereco?: string;
}

export function escolherUnidadePorCidade<T extends OpcaoUnidade>(
  opcoes: T[],
  cidadeCliente: string,
): T | null {
  const alvo = normalizar(cidadeCliente);
  if (!alvo) return null;

  // Casa pela cidade explícita; se a opção não trouxer cidade, tenta pelo nome
  // (as unidades costumam se chamar pelo nome da cidade, ex.: "AGÊNCIA CASTRO ALVES").
  const casa = (o: T): boolean => {
    const cidade = normalizar(o.cidade);
    if (cidade) return cidade === alvo || cidade.includes(alvo) || alvo.includes(cidade);
    return normalizar(o.nome).includes(alvo);
  };

  return opcoes.find(casa) ?? null;
}

/**
 * Anexos (passo 7): cada tipo de documento nosso vai numa CAIXA nomeada
 * específica do GERID. Não é upload genérico — mandar no slot errado seria
 * um documento "faltando" para o analista do INSS.
 *
 * Baseado nos slots vistos nos prints. Slots opcionais sem documento
 * correspondente na pasta ficam vazios (o GERID aceita).
 */
export const SLOT_GERID_POR_TIPO: Record<string, string> = {
  TERMO_REPRESENTACAO: 'Termo de representação da entidade conveniada',
  OAB: 'Documento de identificação do procurador (OAB/RG/CNH/CTPS)',
  PROCURACAO: 'Comprovante da representação legal, se for o caso',
  DOCUMENTOS_PESSOAIS: 'Documentos de identificação do interessado',
  CADASTRO_UNICO: 'Documento de identificação de todos os membros do grupo familiar',
  DOCUMENTOS_MEDICOS: 'Documento Médico',
};

export function slotGeridDoDocumento(tipo: string): string | null {
  return SLOT_GERID_POR_TIPO[tipo] ?? null;
}

/**
 * Monta o plano de preenchimento do grupo familiar (passo 4): para cada
 * integrante que o GERID listou (casado por CPF com a nossa planilha), diz qual
 * parentesco e estado civil marcar. O Titular não tem parentesco a escolher.
 */
export interface LinhaGrupoFamiliarPlano {
  cpf: string;
  titular: boolean;
  parentesco: ParentescoResolvido;
  estadoCivil: string;
}

export function planoGrupoFamiliar(integrantes: Integrante[]): LinhaGrupoFamiliarPlano[] {
  return integrantes.map((i) => ({
    cpf: i.cpf ?? '',
    titular: ehTitular(i.parentesco),
    parentesco: mapearParentesco(i.parentesco),
    estadoCivil: estadoCivilGerid(i.estadoCivil),
  }));
}
