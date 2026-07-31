import type { ArquivoInfo, Cliente, GrupoFamiliar } from '../domain/types';

/** Um caso pronto para ser protocolado no Gerid. */
export interface CasoParaProtocolar {
  cliente: Cliente;
  grupoFamiliar: GrupoFamiliar;
  arquivos: ArquivoInfo[];
  pastaId: string;
}

/**
 * Motivos pelos quais um caso falha DENTRO do Gerid (Módulo 2).
 * Espelha docs/checklists/diagnostico-falha.md.
 */
export const FalhaGerid = {
  SESSAO_EXPIRADA: 'SESSAO_EXPIRADA',
  VERIFICACAO_SEGURANCA: 'VERIFICACAO_SEGURANCA',
  CAMPO_NAO_ENCONTRADO: 'CAMPO_NAO_ENCONTRADO',
  ERRO_PREENCHIMENTO: 'ERRO_PREENCHIMENTO',
  FALHA_UPLOAD: 'FALHA_UPLOAD',
  FALHA_DOWNLOAD_COMPROVANTE: 'FALHA_DOWNLOAD_COMPROVANTE',
  MAPEAMENTO_PENDENTE: 'MAPEAMENTO_PENDENTE',
  ERRO_INESPERADO: 'ERRO_INESPERADO',
} as const;

export type FalhaGerid = (typeof FalhaGerid)[keyof typeof FalhaGerid];

export class ErroGerid extends Error {
  constructor(
    readonly codigo: FalhaGerid,
    mensagem: string,
    /** Caminho do screenshot capturado no momento da falha, se houver. */
    readonly screenshot?: string,
  ) {
    super(mensagem);
    this.name = 'ErroGerid';
  }
}

export interface ResultadoProtocolo {
  protocolo: string;
  /** Caminho local do comprovante baixado do Gerid. */
  comprovanteLocal?: string;
}

/**
 * Contrato do robô que opera o Gerid.
 * Separado da implementação para o Módulo 1/3 e os testes não dependerem de
 * navegador.
 */
export interface RoboGerid {
  /** Prepara o navegador e confirma que há sessão autenticada no Gerid. */
  iniciar(): Promise<void>;
  /** Protocola UM caso e devolve o número do protocolo. */
  protocolar(caso: CasoParaProtocolar, opcoes: import('../modulo2/preencherGerid').OpcoesPreenchimento): Promise<ResultadoProtocolo>;
  /** Fecha o navegador. */
  encerrar(): Promise<void>;
}
