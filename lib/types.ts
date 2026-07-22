// Tipos usados SÓ pelo frontend (execução, relatórios). Os tipos de domínio
// (Cliente, GrupoFamiliar, MotivoRevisao...) vêm do core em src/domain.

export type StatusCaso = 'pendente' | 'processando' | 'sucesso' | 'erro';

export interface CasoExecucao {
  cpf: string;
  nome: string;
  status: StatusCaso;
  /** Número do protocolo quando concluído com sucesso. */
  protocolo?: string;
  /** Motivo quando o caso falhou (categoria do diagnóstico). */
  motivoErro?: string;
}

export type StatusExecucao = 'ociosa' | 'rodando' | 'concluida' | 'erro';

/** Execução em andamento no servidor (consultada por polling). */
export interface ExecucaoAtual {
  id: string;
  iniciadoEm: string;
  status: 'rodando' | 'concluida' | 'erro';
  casos: CasoExecucao[];
}

export type AcaoRevisao = 'resolvido' | 'reprocessar';

export interface RegistroAcaoRevisao {
  acao: AcaoRevisao;
  em: string;
}

/** Campos da config que o usuário pode sobrescrever pela tela de Configurações. */
export interface OverridesConfig {
  limiteTamanhoArquivoBytes?: number;
  telefonePadrao?: string;
  procurador?: { nome: string; cpf: string; oab: string; email: string };
  pastaRaizId?: string;
  spreadsheetId?: string;
  abaClientes?: string;
  abaGrupoFamiliar?: string;
}

export interface Execucao {
  id: string;
  /** ISO 8601 (string fixa no mock; virá do backend depois). */
  dataISO: string;
  total: number;
  prontos: number;
  sucesso: number;
  erro: number;
  casos: CasoExecucao[];
  /**
   * True enquanto a automação real do Gerid (Módulo 2) não existir — o
   * processamento foi simulado. Exibido na UI para não confundir o operador.
   */
  simulado?: boolean;
}
