import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { salvarComprovante } from '../src/modulo3/comprovante';
import { InMemoryDriveGateway } from '../src/integrations/drive/inMemoryDrive';
import type { DriveGateway } from '../src/integrations/drive/driveGateway';

const PASTA = path.join(os.tmpdir(), `rpa-comprovante-${process.pid}`);
const CONTEUDO = new Uint8Array([1, 2, 3, 4]);

afterAll(async () => {
  await fs.rm(PASTA, { recursive: true, force: true });
});

function opcoes() {
  return { pastaClienteId: 'pasta-cliente', nomeBase: 'comprovante protocolo', pastaLocal: PASTA };
}

/** Gateway que simula o Drive aceitando criação (caso Shared Drive). */
function driveQueCria(): DriveGateway {
  const base = new InMemoryDriveGateway({ subpastas: [], arquivos: {} });
  return Object.assign(base, {
    criarArquivo: async () => 'id-no-drive',
  });
}

/** Gateway que reproduz o erro REAL da service account sem cota. */
function driveSemCota(): DriveGateway {
  const base = new InMemoryDriveGateway({ subpastas: [], arquivos: {} });
  return Object.assign(base, {
    criarArquivo: async () => {
      throw new Error(
        'Service Accounts do not have storage quota. Leverage shared drives, or use OAuth delegation instead.',
      );
    },
  });
}

describe('Módulo 3 — salvar comprovante', () => {
  it('salva no Drive quando a conta pode criar arquivo', async () => {
    const r = await salvarComprovante(driveQueCria(), CONTEUDO, 'application/pdf', opcoes());
    expect(r.destino).toBe('drive');
    expect(r.referencia).toBe('id-no-drive');
    expect(r.aviso).toBeUndefined();
  });

  it('cai para disco local quando falta cota, e AVISA (não silencia)', async () => {
    const r = await salvarComprovante(driveSemCota(), CONTEUDO, 'application/pdf', opcoes());

    expect(r.destino).toBe('local');
    expect(r.aviso).toContain('cota');
    // O arquivo realmente existe em disco, com o conteúdo certo.
    const salvo = await fs.readFile(r.referencia);
    expect(new Uint8Array(salvo)).toEqual(CONTEUDO);
    expect(path.basename(r.referencia)).toBe('comprovante protocolo.pdf');
  });

  it('cai para local quando o gateway nem suporta criar arquivo', async () => {
    const semSuporte = new InMemoryDriveGateway({ subpastas: [], arquivos: {} });
    const r = await salvarComprovante(semSuporte, CONTEUDO, 'application/pdf', opcoes());
    expect(r.destino).toBe('local');
    expect(r.aviso).toBeTruthy();
  });
});
