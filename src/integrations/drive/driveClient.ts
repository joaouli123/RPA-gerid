import { Readable } from 'node:stream';
import { drive as criarDriveApi, type drive_v3 } from '@googleapis/drive';
import type { GoogleAuth } from 'google-auth-library';
import type { ArquivoInfo, PastaInfo } from '../../domain/types';
import type { DriveGateway } from './driveGateway';

const MIME_PASTA = 'application/vnd.google-apps.folder';

/**
 * Adapter REAL do Drive (Google Drive API v3). Não é exercitado nos testes
 * (que usam InMemoryDriveGateway); é ligado no run real via src/index.ts.
 * Suporta Shared Drives.
 */
export class DriveClient implements DriveGateway {
  private readonly api: drive_v3.Drive;

  constructor(auth: GoogleAuth) {
    this.api = criarDriveApi({ version: 'v3', auth: auth as never });
  }

  async listarSubpastas(pastaRaizId: string): Promise<PastaInfo[]> {
    return this.paginar(
      `'${pastaRaizId}' in parents and mimeType = '${MIME_PASTA}' and trashed = false`,
      'nextPageToken, files(id, name)',
      (f) => (f.id && f.name ? { id: f.id, nome: f.name } : null),
    );
  }

  async listarArquivos(pastaId: string): Promise<ArquivoInfo[]> {
    return this.paginar(
      `'${pastaId}' in parents and mimeType != '${MIME_PASTA}' and trashed = false`,
      'nextPageToken, files(id, name, size, mimeType)',
      (f) =>
        f.id && f.name
          ? {
              id: f.id,
              nome: f.name,
              tamanhoBytes: Number(f.size ?? 0),
              mimeType: f.mimeType ?? '',
            }
          : null,
    );
  }

  async baixarArquivo(arquivoId: string): Promise<Uint8Array> {
    const res = await this.api.files.get(
      { fileId: arquivoId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return new Uint8Array(res.data as unknown as ArrayBuffer);
  }

  async atualizarArquivo(
    arquivoId: string,
    conteudo: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    // A Drive API espera um stream no corpo da mídia.
    // Import ESTÁTICO de propósito: com `await import('node:stream')` o
    // bundler do Next entrega um namespace sem `Readable` e quebra em runtime.
    await this.api.files.update({
      fileId: arquivoId,
      supportsAllDrives: true,
      media: {
        mimeType,
        body: Readable.from(Buffer.from(conteudo)),
      },
    });
  }

  async copiarArquivo(arquivoId: string, novoNome: string): Promise<string> {
    const res = await this.api.files.copy({
      fileId: arquivoId,
      supportsAllDrives: true,
      requestBody: { name: novoNome },
      fields: 'id',
    });
    const id = res.data.id;
    if (!id) throw new Error('Drive não devolveu o id da cópia de backup.');
    return id;
  }

  /** Percorre todas as páginas de files.list, mapeando cada arquivo. */
  private async paginar<T>(
    q: string,
    fields: string,
    mapear: (f: drive_v3.Schema$File) => T | null,
  ): Promise<T[]> {
    const saida: T[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.api.files.list({
        q,
        fields,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) {
        const item = mapear(f);
        if (item) saida.push(item);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return saida;
  }
}
