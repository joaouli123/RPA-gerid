import { GoogleAuth } from 'google-auth-library';

/**
 * Escopo de LEITURA + ESCRITA no Drive.
 *
 * Precisa ser `drive` (e não `drive.file`): `drive.file` só dá acesso a
 * arquivos criados pelo próprio app, e a planilha já existe e é do cliente.
 * A escrita é usada para o cadastro pelo sistema alimentar a planilha
 * (e, no Módulo 3, salvar o comprovante na pasta do cliente).
 */
export const ESCOPOS = ['https://www.googleapis.com/auth/drive'];

/** @deprecated use ESCOPOS — mantido para não quebrar chamadas antigas. */
export const ESCOPOS_LEITURA = ESCOPOS;

/**
 * Cria o cliente de autenticação da Service Account.
 *
 * Aceita a credencial de duas formas:
 *   1. `RPA_GOOGLE_CREDENTIALS` — o JSON inteiro numa variável de ambiente.
 *      É o jeito usado em servidor (Railway etc.), onde não dá para subir
 *      arquivo de segredo junto com o código.
 *   2. `RPA_GOOGLE_KEY_FILE` — caminho para o arquivo .json (uso local).
 *
 * A pasta "Protocolo INSS" e a planilha precisam estar compartilhadas com o
 * e-mail da Service Account, com permissão de EDITOR (o cadastro grava nela).
 */
export function criarAuth(
  keyFile: string | undefined = process.env.RPA_GOOGLE_KEY_FILE,
  scopes: string[] = ESCOPOS,
): GoogleAuth {
  const credenciaisJson = process.env.RPA_GOOGLE_CREDENTIALS?.trim();

  if (credenciaisJson) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(credenciaisJson) as Record<string, unknown>;
    } catch {
      throw new Error(
        'RPA_GOOGLE_CREDENTIALS não é um JSON válido. Cole o conteúdo inteiro do arquivo da service account.',
      );
    }
    return new GoogleAuth({ credentials, scopes });
  }

  if (keyFile) return new GoogleAuth({ keyFile, scopes });

  throw new Error(
    'Credencial do Google ausente. Defina RPA_GOOGLE_CREDENTIALS (JSON completo, usado em servidor) ' +
      'ou RPA_GOOGLE_KEY_FILE (caminho do arquivo, uso local). Ver .env.example.',
  );
}

/** True se há credencial configurada por qualquer um dos dois caminhos. */
export function temCredencial(): boolean {
  return Boolean(
    process.env.RPA_GOOGLE_CREDENTIALS?.trim() || process.env.RPA_GOOGLE_KEY_FILE?.trim(),
  );
}
