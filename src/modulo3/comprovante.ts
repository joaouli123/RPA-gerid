import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { DriveGateway } from '../integrations/drive/driveGateway';

/**
 * MÓDULO 3 — destino do comprovante do protocolo.
 *
 * ⚠️ Limitação REAL, comprovada contra o Drive do cliente em 2026-07-22:
 * service account **não tem cota de armazenamento** e por isso não consegue
 * CRIAR arquivo no Drive pessoal ("Service Accounts do not have storage
 * quota"). Ela consegue LER e ALTERAR arquivo existente, mas não criar.
 *
 * Enquanto o cliente não migrar para Shared Drive ou autorizar OAuth, o
 * comprovante é salvo LOCALMENTE e o relatório aponta onde ele está — em vez
 * de o robô fingir que arquivou no Drive.
 */

export type DestinoComprovante = 'drive' | 'local';

export interface ComprovanteSalvo {
  destino: DestinoComprovante;
  /** Caminho local ou id do arquivo no Drive. */
  referencia: string;
  /** Preenchido quando não deu para salvar no Drive. */
  aviso?: string;
  /**
   * A falha é a limitação de cota já conhecida, não uma novidade.
   *
   * Existe para o Diagnóstico saber a diferença. Esta falha acontece em TODO
   * protocolo enquanto o escritório não migrar de credencial, então tratá-la
   * como ocorrência nova encheria a tela de linhas idênticas e enterraria as
   * variações de erro que ela existe para revelar.
   */
  limitacaoConhecida?: boolean;
}

export interface OpcoesComprovante {
  /** Pasta do cliente no Drive (destino ideal). */
  pastaClienteId: string;
  /** Nome do arquivo, sem extensão (config.posProtocolo.nomeComprovante). */
  nomeBase: string;
  /** Onde guardar quando o Drive não aceitar. */
  pastaLocal: string;
}

/**
 * Tenta salvar no Drive; se a conta não tiver cota, cai para o disco local e
 * devolve o aviso. Nunca silencia a falha.
 */
export async function salvarComprovante(
  drive: DriveGateway,
  conteudo: Uint8Array,
  mimeType: string,
  opcoes: OpcoesComprovante,
): Promise<ComprovanteSalvo> {
  const extensao = mimeType.includes('pdf') ? 'pdf' : 'bin';
  const nomeArquivo = `${opcoes.nomeBase}.${extensao}`;

  if (typeof drive.criarArquivo === 'function') {
    try {
      const id = await drive.criarArquivo(
        opcoes.pastaClienteId,
        nomeArquivo,
        conteudo,
        mimeType,
      );
      return { destino: 'drive', referencia: id };
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      const semCota = /storage quota|storageQuota/i.test(msg);
      const referencia = await salvarLocal(conteudo, nomeArquivo, opcoes.pastaLocal);
      return {
        destino: 'local',
        referencia,
        limitacaoConhecida: semCota,
        aviso: semCota
          ? 'A service account não tem cota de armazenamento e não pode criar arquivos no Drive. ' +
            'O comprovante ficou salvo localmente — ver docs/serviceaccount-cota.md.'
          : `Não foi possível salvar no Drive (${msg}). Comprovante salvo localmente.`,
      };
    }
  }

  const referencia = await salvarLocal(conteudo, nomeArquivo, opcoes.pastaLocal);
  return {
    destino: 'local',
    referencia,
    aviso: 'Este gateway não suporta criar arquivos no Drive; comprovante salvo localmente.',
  };
}

async function salvarLocal(
  conteudo: Uint8Array,
  nomeArquivo: string,
  pastaLocal: string,
): Promise<string> {
  await fs.mkdir(pastaLocal, { recursive: true });
  const destino = path.join(pastaLocal, nomeArquivo);
  await fs.writeFile(destino, conteudo);
  return destino;
}
