import type { MotivoRevisao } from './motivos';

// ---------------------------------------------------------------------------
// Estruturas vindas do Google Drive
// ---------------------------------------------------------------------------

export interface PastaInfo {
  id: string;
  nome: string;
}

export interface ArquivoInfo {
  id: string;
  nome: string;
  tamanhoBytes: number;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Grupo familiar — REQUISITO DE 1ª CLASSE: lista de tamanho variável.
// O requerente é o integrante com parentesco "Titular". A lista pode ter
// de 1 (mora sozinho) a N integrantes.
// ---------------------------------------------------------------------------

export interface Integrante {
  nome: string;
  /**
   * Parentesco em relação ao requerente, como está na planilha (texto bruto).
   * "Titular" identifica o próprio requerente. Mantido como string para ser
   * robusto a variações de digitação; use ehTitular() para classificar.
   */
  parentesco: string;
  cpf?: string;
  estadoCivil?: string;
  dataNascimento?: string;
  renda?: string;
  /** Colunas extras da aba GrupoFamiliar ainda não mapeadas (campos do Gerid a confirmar). */
  camposAdicionais?: Record<string, string>;
}

export interface GrupoFamiliar {
  /** CPF do requerente (só dígitos) — chave que liga os integrantes ao cliente. */
  requerenteCpf: string;
  /** Sempre >= 1; deve conter exatamente 1 "Titular". */
  integrantes: Integrante[];
}

// ---------------------------------------------------------------------------
// Cliente / requerente (aba Clientes)
// ---------------------------------------------------------------------------

export interface Cliente {
  /** Nome da subpasta do cliente dentro de "Protocolo INSS". */
  pasta: string;
  cpf: string;
  nome: string;
  cidade: string;
  cep: string;
  /** Se vazio, usa-se o telefone padrão do escritório (config). */
  telefone?: string;
  camposAdicionais?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Resultado do Módulo 1
// ---------------------------------------------------------------------------

export interface ClienteValidado {
  cliente: Cliente;
  pastaId: string;
  grupoFamiliar: GrupoFamiliar;
  arquivos: ArquivoInfo[];
}

export interface ClienteRevisao {
  pasta: string;
  cpf?: string;
  motivos: MotivoRevisao[];
  /**
   * Dados que conseguimos coletar mesmo com o caso em revisão. Ficam
   * disponíveis para a tela de detalhe mostrar o que já existe (grupo
   * familiar, documentos) em vez de só listar os problemas.
   */
  cliente?: Cliente;
  grupoFamiliar?: GrupoFamiliar;
  arquivos?: ArquivoInfo[];
}

export interface ResultadoLeitura {
  /** Passaram em todas as validações -> elegíveis para o Módulo 2 (Gerid). */
  clientesProntos: ClienteValidado[];
  /** Precisam de intervenção humana, com motivos tipados. */
  clientesParaRevisao: ClienteRevisao[];
  resumo: { total: number; prontos: number; revisao: number };
}

// ---------------------------------------------------------------------------
// Mapeamento configurável planilha -> campos (para casar com a planilha real)
// ---------------------------------------------------------------------------

/**
 * Nome da coluna na planilha, ou uma lista de nomes aceitos (apelidos).
 * Casar cabeçalho é frágil — aceitar variações evita quebrar quando o
 * escritório escreve "Cidade" em vez de "Cidade do protocolo".
 */
export type ColunaMapeada = string | string[];

// Declarados como `type` (e não `interface`) de propósito: assim são
// atribuíveis a Record<string, ColunaMapeada> e podem ser percorridos
// genericamente pelo parser.
export type MapeamentoClientes = {
  pasta: ColunaMapeada;
  cpf: ColunaMapeada;
  nome: ColunaMapeada;
  cidade: ColunaMapeada;
  cep: ColunaMapeada;
  telefone: ColunaMapeada;
};

export type MapeamentoGrupoFamiliar = {
  cpfRequerente: ColunaMapeada;
  nome: ColunaMapeada;
  parentesco: ColunaMapeada;
  cpf: ColunaMapeada;
  estadoCivil: ColunaMapeada;
  dataNascimento: ColunaMapeada;
  renda: ColunaMapeada;
};

export interface DocumentoEsperado {
  /** Identificador estável do tipo (usado em contexto de motivos). */
  tipo: string;
  /** Rótulo legível. */
  rotulo: string;
  /**
   * true  -> a ausência BLOQUEIA o protocolo (vira DOCUMENTO_FALTANDO);
   * false -> facultativo: a ausência é só informada na tela, não bloqueia.
   * Confirmado com o cliente em 2026-07-20 (áudio): obrigatórios são
   * Termo de representação, Procuração, Documentos pessoais e OAB.
   */
  obrigatorio: boolean;
  /**
   * Padrões (regex, aplicados no nome de arquivo já sem acento e minúsculo).
   * Basta 1 arquivo casar 1 padrão para o documento ser considerado presente.
   * ATENÇÃO: casar por nome de arquivo é frágil — ver
   * docs/checklists/validacao-pre-gerid.md.
   */
  padroes: string[];
}
