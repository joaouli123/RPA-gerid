import type { ArquivoInfo, PastaInfo } from '../../domain/types';

/**
 * PORT — contrato de acesso ao Drive de que o Módulo 1 depende.
 * O Módulo 1 conhece SÓ esta interface; os adapters (Google real / em memória)
 * a implementam. É isto que permite rodar toda a suíte sem rede/credenciais.
 */
export interface DriveGateway {
  /** Lista as subpastas diretas da pasta raiz (cada uma = 1 cliente). */
  listarSubpastas(pastaRaizId: string): Promise<PastaInfo[]>;
  /** Lista os arquivos (não-pastas) dentro de uma pasta de cliente. */
  listarArquivos(pastaId: string): Promise<ArquivoInfo[]>;
  /**
   * Baixa o conteúdo bruto de um arquivo.
   * Necessário porque a planilha do escritório é um .xlsx (arquivo comum no
   * Drive), e não uma planilha nativa do Google — a Sheets API não lê .xlsx.
   */
  baixarArquivo(arquivoId: string): Promise<Uint8Array>;
  /**
   * Substitui o conteúdo de um arquivo EXISTENTE (usado para gravar a planilha).
   * Funciona com service account porque não cria arquivo novo — só altera um
   * que já existe e pertence ao usuário.
   */
  atualizarArquivo(arquivoId: string, conteudo: Uint8Array, mimeType: string): Promise<void>;
  /**
   * Cria uma cópia do arquivo. Devolve o id da cópia.
   *
   * ⚠️ NÃO funciona com service account em Drive pessoal: contas de serviço não
   * têm cota de armazenamento ("Service Accounts do not have storage quota").
   * Só funciona em Shared Drive. Por isso o backup da planilha é feito em disco
   * local, e o Módulo 3 (salvar comprovante no Drive) vai esbarrar nisto —
   * ver docs/serviceaccount-cota.md.
   */
  copiarArquivo(arquivoId: string, novoNome: string): Promise<string>;
  /**
   * Cria um arquivo novo dentro de uma pasta. Devolve o id.
   *
   * OPCIONAL de propósito: com service account em Drive pessoal isto SEMPRE
   * falha por falta de cota (mesmo motivo de copiarArquivo). O Módulo 3 trata
   * a ausência/falha caindo para disco local. Ver docs/serviceaccount-cota.md.
   */
  criarArquivo?(
    pastaId: string,
    nome: string,
    conteudo: Uint8Array,
    mimeType: string,
  ): Promise<string>;
}
