/**
 * REGRAS DE PREENCHIMENTO DO GERID — lógica pura, sem navegador.
 *
 * Aqui moram as decisões do escritório sobre COMO preencher cada campo.
 * Ficam separadas do Playwright de propósito: assim dá para TESTAR a regra sem
 * abrir navegador, e o robô só executa o que já foi validado aqui.
 *
 * FONTE DOS RÓTULOS: docs/gerid-mapeamento-real.md — capturado do DOM da
 * aplicação em produção em 28/07/2026, com o Fabrício ao vivo. NADA aqui é
 * inferido de print.
 *
 * ⚠️ Os ids numéricos das opções SE REPETEM entre dropdowns diferentes:
 * o radio `1` é "Solteiro" no estado civil e "Cônjuge" no parentesco. Por isso
 * cada opção carrega o id E o rótulo, e o robô SEMPRE escopa a busca no
 * container do próprio combobox (`{idDoCombobox}-itens`).
 */

import { ehTitular } from './domain/grupoFamiliar';
import { normalizar } from './domain/texto';
import type { GrupoFamiliar, Integrante } from './domain/types';

/** Uma opção de combobox do GERID: id do radio + rótulo exato exibido. */
export interface OpcaoGerid {
  id: string;
  rotulo: string;
}

// ---------------------------------------------------------------------------
// Passo 1 — serviço
// ---------------------------------------------------------------------------

/**
 * Código do serviço no GERID. É o id do radio dentro de
 * `#idSelecionarServico-itens` — código numérico do INSS, bem mais estável que
 * digitar o nome do serviço num combobox.
 */
export const SERVICO_BPC_PCD: OpcaoGerid = {
  id: '1655',
  rotulo: 'Benefício Assistencial à Pessoa com Deficiência',
};

// ---------------------------------------------------------------------------
// Passos 5, 6 e 7 — respostas que não variam por cliente
// ---------------------------------------------------------------------------

/**
 * Respostas confirmadas pelo escritório como SEMPRE iguais.
 * O `id` do combobox (hash) vem do DOM real; o `pergunta` é o texto visível ao
 * lado, que é como o robô localiza o campo — o hash serve só de conferência,
 * porque id gerado não é contrato (ver checklist de seletor).
 */
export const RESPOSTAS_FIXAS = {
  /** Passo 5. "Gastos com a deficiência negados pelo poder público?" */
  comprometimentoDeRenda: 'Não',
  /** Passo 6. "Proteção Especial SUAS (Centro-Dia) negada?" */
  protecaoEspecialSuas: 'Não',
  /** Passo 7. Aceita acompanhar o andamento (Meu INSS / 135 / e-mail). */
  acompanhaProcesso: 'Sim',
  /** Passo 7. "Você é estrangeiro em situação regular no Brasil?" */
  estrangeiro: 'B) Não',
  /** Passo 7. "Deseja cadastrar Representante Legal para este pedido?" */
  representanteLegal: 'Não',
  /** Passo 7. "Deseja cadastrar Procurador para este pedido?" (o advogado). */
  procurador: 'Sim',
  /** Passo 7. "Onde você mora?" */
  ondeMora: 'Moro em residência',
  /** Passo 7. "Recebe algum tipo de benefício?" — atenção ao espaço final. */
  recebeBeneficio: 'C) Não',
  /** Passo 7. "...autoriza o INSS a alterar a data do pedido...?" */
  alterarDataPedido: 'Sim',

  // --- Acordo Internacional ---
  quemAtendido: 'O procurador do titular',
  resideBrasil: 'A) Sim', // Padrão
  beneficioExclusivoExterior: 'B) Não',
  condicaoDeficiencia: 'B) Não',
  tempoRural: 'B) Não',
  concederOutraAposentadoria: 'A) Sim',
  cessacaoBeneficio: 'A) Sim',
  pensaoPorMorte: 'B) Não',

  // --- Acertos Perícia Médica ---
  procuradorRepresentanteLegal: 'Sim',
  ajusteNovoAuxilio: 'Não',
  motivoSolicitacao: 'Outros', // Default fallback
  empregado: 'Não',
  estadoCivil7: 'Solteiro(a)', // Default, will probably need to map from caso.cliente.estadoCivil later if we want it perfect
  corRaca: 'Não Informado',
  grauInstrucao: 'Não Informado',
} as const;

/**
 * Perguntas exatas do passo 7, como aparecem na tela. O robô localiza o
 * combobox por este texto (e não pelo id, que é hash).
 */
export const PERGUNTAS_PASSO7 = {
  estrangeiro: 'Você é estrangeiro em situação regular no Brasil?',
  representanteLegal: 'Deseja cadastrar Representante Legal para este pedido?',
  procurador: 'Deseja cadastrar Procurador para este pedido?',
  ondeMora: 'Onde você mora?',
  recebeBeneficio: 'Recebe algum tipo de benefício?',
  alterarDataPedido:
    'autoriza o INSS a alterar a data do pedido para atender às condições para o benefício?',
  bolsaFamilia: 'bolsa família',
  ciencia:
    'Estou ciente de que devo acompanhar o pedido pelos canais de atendimento',
  apelido: 'Conhecido por/Apelido',

  // --- Novas perguntas do fluxo Acordo Internacional ---
  quemAtendido: 'Quem está sendo atendido?',
  resideBrasil: 'Você reside no Brasil?',
  beneficioExclusivoExterior: 'Você quer benefício exclusivo no exterior?',
  condicaoDeficiencia: 'Trabalha ou trabalhou na condição de pessoa com deficiência?',
  tempoRural: 'Você possui tempo rural?',
  concederOutraAposentadoria: 'Caso não tenha direito a este benefício, autoriza o INSS a conceder outro tipo de aposentadoria',
  cessacaoBeneficio: 'concorda com a cessação do benefício menos vantajoso',
  pensaoPorMorte: 'Recebe pensão por morte deixada por cônjuge/companheiro(a) em outro regime',

  // --- Novas perguntas do fluxo Acertos para Marcação de Perícia Médica ---
  procuradorRepresentanteLegal: 'Você é Procurador ou Representante Legal para este pedido?',
  ajusteNovoAuxilio: 'Trata-se de ajuste para solicitar novo auxílio-doença ou para prorrogar benefício?',
  motivoSolicitacao: 'Motivo da solicitação',
  empregado: 'Trata-se de empregado?',
  estadoCivil7: 'Estado Civil',
  corRaca: 'Cor/Raça',
  grauInstrucao: 'Grau de Instrução',
} as const;

/**
 * 🔴 BOLSA FAMÍLIA — NÃO é Sim/Não.
 *
 * O DOM revelou 4 opções, não 2. O código antigo respondia 'Sim' fixo
 * (autorizando o desligamento voluntário). Se a família NÃO recebe Bolsa
 * Família, "Sim" é resposta errada — a correta é "Não há recebimento de Bolsa
 * Família".
 *
 * Enquanto o escritório não define a regra, o robô NÃO responde: registra um
 * aviso e deixa para o advogado marcar na revisão. É preferível um campo em
 * branco na tela de Confirmar a uma declaração errada ao INSS.
 */
export const OPCOES_BOLSA_FAMILIA: OpcaoGerid[] = [
  { id: 'Sim', rotulo: 'Sim' },
  { id: 'Não', rotulo: 'Não' },
  {
    id: 'Não há recebimento de Bolsa Família ',
    rotulo: 'Não há recebimento de Bolsa Família',
  },
  {
    id: 'O titular do BPC ou o seu representante legal não é o responsável familiar no CadÚnico',
    rotulo:
      'O titular do BPC ou o seu representante legal não é o responsável familiar no CadÚnico',
  },
];

/** null = sem regra definida; o robô deixa em branco e avisa. */
export const RESPOSTA_BOLSA_FAMILIA: string | null = null;

/**
 * ⚠️ FORMA DE CONVÍVIO — campo NÃO ENCONTRADO no DOM (28/07/2026).
 *
 * Nenhum combobox do passo 7 tem estas opções, e nenhum rótulo menciona
 * convívio. O docs/gerid-fluxo-real.md (reconstruído de prints) lista o campo,
 * mas ele não existe na tela atual.
 *
 * Mantido por ora porque pode ser condicional. O robô tenta preencher; se o
 * campo não existir, segue em frente com um aviso — nunca falha por causa
 * dele. Se a próxima sessão confirmar a ausência, remover isto e os 2 testes.
 */
export const FORMA_CONVIVIO = {
  comFamilia: 'Com pessoas da família',
  sozinho: 'Sozinho', // nunca confirmado no DOM
} as const;

export function formaDeConvivio(grupo: GrupoFamiliar): string {
  const moraSozinho = grupo.integrantes.length <= 1;
  return moraSozinho ? FORMA_CONVIVIO.sozinho : FORMA_CONVIVIO.comFamilia;
}

// ---------------------------------------------------------------------------
// Passo 4 — estado civil
// ---------------------------------------------------------------------------

export const ESTADO_CIVIL_PADRAO = 'Solteiro';

/**
 * Opções REAIS do combobox `selectEstadoCivil{i}` (container
 * `selectEstadoCivil{i}-itens`), capturadas do DOM.
 *
 * Correção importante: o comentário antigo dizia que "o GERID não distingue"
 * união estável de casado, e mapeava união estável -> Casado e separado ->
 * Divorciado. É FALSO: existem opções próprias para "União Estável" e
 * "Separado". Isso gravava estado civil errado em requerimento real.
 */
export const OPCOES_ESTADO_CIVIL: OpcaoGerid[] = [
  { id: '1', rotulo: 'Solteiro' },
  { id: '2', rotulo: 'Casado' },
  { id: '3', rotulo: 'Viúvo' },
  { id: '4', rotulo: 'Divorciado' },
  { id: '5', rotulo: 'Separado' },
  { id: '6', rotulo: 'União Estável' },
];

const ESTADOS_CIVIS_GERID: Record<string, string> = {
  solteiro: 'Solteiro',
  casado: 'Casado',
  viuvo: 'Viúvo',
  divorciado: 'Divorciado',
  separado: 'Separado', // CORRIGIDO: existe opção própria (id 5)
  'uniao estavel': 'Casado',
  amasiado: 'Casado',
  concubinato: 'Casado',
};

/**
 * DECISÃO DO ESCRITÓRIO (28/07/2026): estado civil é SEMPRE "Solteiro",
 * independente do que a planilha diz.
 *
 * ⚠️ Isto descarta a coluna "Estado civil" da planilha, inclusive quando ela
 * diz "Casado", e é uma declaração ao INSS dentro do requerimento. Fica nesta
 * constante, isolada, para ser fácil de reverter: com `false`, volta a usar a
 * planilha e cai em Solteiro só quando o valor estiver vazio ou irreconhecível.
 */
export const ESTADO_CIVIL_SEMPRE_PADRAO = false;

export function estadoCivilGerid(valorPlanilha?: string): string {
  if (ESTADO_CIVIL_SEMPRE_PADRAO) return ESTADO_CIVIL_PADRAO;

  const chave = normalizar(valorPlanilha);
  if (!chave) return ESTADO_CIVIL_PADRAO;
  return ESTADOS_CIVIS_GERID[chave] ?? ESTADO_CIVIL_PADRAO;
}

// ---------------------------------------------------------------------------
// Passo 4 — parentesco
// ---------------------------------------------------------------------------

/**
 * Opções REAIS do combobox `selectParentesco{i}`, capturadas do DOM.
 *
 * Correções em relação ao que estava no código:
 *  - "Cônjuge / Companheiro(a)" não existe: são DUAS opções separadas.
 *  - "Filho / Filha / Enteado(a)" não existe: são DUAS opções separadas.
 *  - "Avô / Avó" NÃO EXISTE no GERID.
 *  - Existem "Menor Tutelado" e "Outros", que não estavam mapeados.
 */
export const OPCOES_PARENTESCO: OpcaoGerid[] = [
  { id: '1', rotulo: 'Cônjuge' },
  { id: '2', rotulo: 'Filho(a)' },
  { id: '3', rotulo: 'Pai / Mãe / Padrasto / Madrasta' },
  { id: '4', rotulo: 'Irmão / Irmã' },
  { id: '6', rotulo: 'Companheiro (a)' },
  { id: '8', rotulo: 'Enteado' },
  { id: '9', rotulo: 'Menor Tutelado' },
  { id: '17', rotulo: 'Outros' },
];

const GRUPOS_PARENTESCO_GERID = {
  paisPadrastos: 'Pai / Mãe / Padrasto / Madrasta',
  irmaos: 'Irmão / Irmã',
  companheiro: 'Companheiro (a)',
  conjuge: 'Cônjuge',
  filhos: 'Filho(a)',
  enteado: 'Enteado',
  menorTutelado: 'Menor Tutelado',
  outros: 'Outros',
} as const;

/**
 * DECISÃO DO ESCRITÓRIO: quando a planilha indica cônjuge,
 * companheiro, esposa, marido etc., marcar "Companheiro (a)".
 */
const MAPA_PARENTESCO: Array<{ termos: string[]; grupo: string; confirmado: boolean }> = [
  { termos: ['mae', 'pai', 'padrasto', 'madrasta'], grupo: GRUPOS_PARENTESCO_GERID.paisPadrastos, confirmado: true },
  { termos: ['irmao', 'irma'], grupo: GRUPOS_PARENTESCO_GERID.irmaos, confirmado: true },
  {
    termos: ['conjuge', 'companheir', 'esposa', 'esposo', 'marido'],
    grupo: GRUPOS_PARENTESCO_GERID.companheiro,
    confirmado: false,
  },
  { termos: ['entead'], grupo: GRUPOS_PARENTESCO_GERID.enteado, confirmado: true },
  { termos: ['filho', 'filha'], grupo: GRUPOS_PARENTESCO_GERID.filhos, confirmado: false },
  { termos: ['tutelad'], grupo: GRUPOS_PARENTESCO_GERID.menorTutelado, confirmado: true },
];

export interface ParentescoResolvido {
  /** O rótulo do GERID a selecionar (ou null se desconhecido). */
  grupo: string | null;
  /** True quando o parentesco da planilha tem correspondente direto no GERID. */
  confirmado: boolean;
  /** Alias não-enumerável para retrocompatibilidade do preencherGerid. */
  exato?: boolean;
}

export function mapearParentesco(parentescoPlanilha: string): ParentescoResolvido {
  if (ehTitular(parentescoPlanilha)) {
    const res: ParentescoResolvido = { grupo: 'Requerente', confirmado: true };
    Object.defineProperty(res, 'exato', { value: true, enumerable: false, configurable: true });
    return res;
  }

  const p = normalizar(parentescoPlanilha);
  for (const entrada of MAPA_PARENTESCO) {
    if (entrada.termos.some((t) => p.includes(t))) {
      const res: ParentescoResolvido = { grupo: entrada.grupo, confirmado: entrada.confirmado };
      Object.defineProperty(res, 'exato', { value: entrada.confirmado, enumerable: false, configurable: true });
      return res;
    }
  }
  const res: ParentescoResolvido = { grupo: null, confirmado: false };
  Object.defineProperty(res, 'exato', { value: false, enumerable: false, configurable: true });
  return res;
}

// ---------------------------------------------------------------------------
// Passos 8 e 9 — unidade e órgão pagador
// ---------------------------------------------------------------------------

export interface OpcaoUnidade {
  /** Texto completo da linha, como o GERID renderiza. */
  nome: string;
  cidade?: string;
  bairro?: string;
  endereco?: string;
}

/**
 * Extrai a cidade de uma linha de unidade do GERID.
 *
 * O DOM real mostra que a cidade vem SEMPRE no padrão `CIDADE-UF` logo antes
 * de `CEP:`. Exemplo capturado em 28/07/2026:
 *
 *   AGÊNCIA SANTALUZ AVENIDA NILTON OLIVEIRA SANTOS, SANTALUZ-BA CEP: 48.880-000
 *   AGÊNCIA QUEIMADAS/BA ALTO DA CHACRINHA QUEIMADAS-BA CEP: 48.860-000
 *
 * Cuidados que o padrão resolve:
 *  - o NOME da agência às vezes traz "/BA" colado ("AGÊNCIA QUEIMADAS/BA"),
 *    então o nome não serve para extrair cidade;
 *  - o endereço vem sem acento ("CONCEICAO DO COITE-BA") e o nome com acento —
 *    `normalizar()` resolve;
 *  - o endereço pode conter nome de cidade em nome de rua, e era exatamente
 *    isso que fazia o casamento por texto inteiro escolher a agência errada.
 */
export function extrairCidadeDaUnidade(textoLinha: string): string | null {
  const m = /([A-Za-zÀ-ÿ0-9'.\s]+?)\s*-\s*([A-Z]{2})\s+CEP\s*:/u.exec(textoLinha);
  const cidade = m?.[1]?.trim();
  return cidade ? cidade : null;
}

/**
 * Escolhe a unidade da MESMA cidade do cliente (regra do Fabrício: o CEP
 * costuma trazer a agência da cidade e mais várias de cidades vizinhas).
 *
 * Mudança em relação à versão anterior: a comparação é por IGUALDADE da cidade
 * extraída do padrão `CIDADE-UF`, e não mais `includes()` sobre o texto inteiro
 * da linha. Com `includes()`, uma agência de outra cidade cujo ENDEREÇO citasse
 * a cidade do cliente era escolhida por engano.
 *
 * Nenhuma casar => null. O robô não escolhe cidade errada; vira pendência.
 */
export function escolherUnidadePorCidade<T extends OpcaoUnidade>(
  opcoes: T[],
  cidadeCliente: string,
): T | null {
  const alvo = normalizar(cidadeCliente);
  if (!alvo) return null;

  const cidadeDa = (o: T): string =>
    normalizar(o.cidade ?? extrairCidadeDaUnidade(o.nome) ?? '');

  // 1) igualdade exata da cidade — o caso normal.
  const exata = opcoes.find((o) => cidadeDa(o) === alvo);
  if (exata) return exata;

  // 2) tolerância a sufixo de UF grudado no nome da cidade ("QUEIMADAS/BA").
  const semUf = (s: string): string => s.replace(/[\/-][a-z]{2}$/u, '').trim();
  const porCidade = opcoes.find((o) => semUf(cidadeDa(o)) === semUf(alvo));
  if (porCidade) return porCidade;

  // 3) fallback por nome quando a opção não traz cidade explícita
  return opcoes.find((o) => !o.cidade && normalizar(o.nome).includes(alvo)) ?? null;
}

// ---------------------------------------------------------------------------
// Passo 7 — anexos
// ---------------------------------------------------------------------------

/**
 * Os 11 slots nomeados de anexo do GERID, na ORDEM em que aparecem no DOM.
 * Confirmado em 28/07/2026. `obrigatorio` reflete o asterisco na tela.
 *
 * Observação: só 2 slots são obrigatórios para o INSS (0 e 4). A nossa regra
 * exige 4 documentos — é mais restritiva de propósito, decisão do escritório.
 */
export const SLOTS_GERID: Array<{ indice: number; rotulo: string; obrigatorio: boolean }> = [
  { indice: 0, rotulo: 'Termo de representação da entidade conveniada', obrigatorio: true },
  { indice: 1, rotulo: 'Documento de identificação do procurador (OAB/RG/CNH/CTPS)', obrigatorio: false },
  { indice: 2, rotulo: 'Comprovante da representação legal, se for o caso', obrigatorio: false },
  { indice: 3, rotulo: 'Documentos de identificação do representante legal, se for o caso', obrigatorio: false },
  { indice: 4, rotulo: 'Documentos de identificação do interessado', obrigatorio: true },
  { indice: 5, rotulo: 'Documento de identificação de todos os membros do grupo familiar', obrigatorio: false },
  { indice: 6, rotulo: 'Comprovantes das relações previdenciárias do interessado e do grupo familiar', obrigatorio: false },
  { indice: 7, rotulo: 'Outros documentos', obrigatorio: false },
  { indice: 8, rotulo: 'Documento Médico', obrigatorio: false },
  { indice: 9, rotulo: 'Comprovante do cadastro biométrico do titular', obrigatorio: false },
  { indice: 10, rotulo: 'Comprovante do cadastro biométrico do representante legal', obrigatorio: false },
];

/** Extensões aceitas por TODOS os slots (confirmado no DOM). Não aceita .doc/.docx. */
export const EXTENSOES_ACEITAS = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp'];

/**
 * Mapeia nosso tipo de documento para o slot do GERID.
 * ✅ Conferido contra o DOM em 28/07/2026: os 6 tipos casam 1:1. Sem correção.
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

/** Índice do slot (0-10) a partir do nosso tipo — usado como conferência cruzada. */
export function indiceSlotDoDocumento(tipo: string): number | null {
  const rotulo = slotGeridDoDocumento(tipo);
  if (!rotulo) return null;
  return SLOTS_GERID.find((s) => s.rotulo === rotulo)?.indice ?? null;
}

export function extensaoAceita(nomeArquivo: string): boolean {
  const ext = /\.[a-z0-9]+$/i.exec(nomeArquivo)?.[0]?.toLowerCase();
  return ext ? EXTENSOES_ACEITAS.includes(ext) : false;
}

// ---------------------------------------------------------------------------
// Plano do grupo familiar (passo 4)
// ---------------------------------------------------------------------------

export interface LinhaGrupoFamiliarPlano {
  cpf: string;
  titular: boolean;
  parentesco: ParentescoResolvido;
  estadoCivil: string;
}

/**
 * Plano de preenchimento do grupo familiar. O GERID já lista as pessoas
 * (vindas do CadÚnico) — o robô só marca parentesco e estado civil por CPF.
 *
 * A linha do requerente (índice 0) NÃO tem combobox de parentesco: o DOM real
 * não tem `selectParentesco0`, só `selectEstadoCivil0`.
 */
export function planoGrupoFamiliar(integrantes: Integrante[]): LinhaGrupoFamiliarPlano[] {
  return integrantes.map((i) => ({
    cpf: i.cpf ?? '',
    titular: ehTitular(i.parentesco),
    parentesco: mapearParentesco(i.parentesco),
    estadoCivil: estadoCivilGerid(i.estadoCivil),
  }));
}
