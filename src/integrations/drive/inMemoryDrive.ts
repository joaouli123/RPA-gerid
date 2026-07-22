import type { ArquivoInfo, PastaInfo } from '../../domain/types';
import type { DriveGateway } from './driveGateway';

export interface SementeDrive {
  subpastas: PastaInfo[];
  /** arquivos indexados por id da pasta. */
  arquivos: Record<string, ArquivoInfo[]>;
  /** conteúdo bruto opcional, indexado por id do arquivo. */
  conteudos?: Record<string, Uint8Array>;
}

/**
 * Adapter em memória do Drive. Usado tanto pelos testes quanto pelo dry-run
 * (`pnpm demo`), então não é "só" um mock de teste — é um adapter legítimo
 * para rodar o Módulo 1 sem credenciais.
 */
export class InMemoryDriveGateway implements DriveGateway {
  constructor(private readonly semente: SementeDrive) {}

  async listarSubpastas(_pastaRaizId: string): Promise<PastaInfo[]> {
    return this.semente.subpastas;
  }

  async listarArquivos(pastaId: string): Promise<ArquivoInfo[]> {
    return this.semente.arquivos[pastaId] ?? [];
  }

  async baixarArquivo(arquivoId: string): Promise<Uint8Array> {
    const conteudo = this.semente.conteudos?.[arquivoId];
    if (!conteudo) {
      throw new Error(`Conteúdo do arquivo "${arquivoId}" não foi semeado no InMemoryDrive.`);
    }
    return conteudo;
  }

  async atualizarArquivo(
    arquivoId: string,
    conteudo: Uint8Array,
    _mimeType: string,
  ): Promise<void> {
    this.semente.conteudos ??= {};
    this.semente.conteudos[arquivoId] = conteudo;
  }

  async copiarArquivo(arquivoId: string, novoNome: string): Promise<string> {
    const original = this.semente.conteudos?.[arquivoId];
    if (!original) throw new Error(`Arquivo "${arquivoId}" não existe para copiar.`);
    const novoId = `copia-${novoNome}`;
    this.semente.conteudos ??= {};
    this.semente.conteudos[novoId] = original;
    return novoId;
  }
}
