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
 * Cria o cliente de autenticação a partir do JSON de uma Service Account.
 * A pasta "Protocolo INSS" e a planilha precisam estar compartilhadas com o
 * e-mail da Service Account — com permissão de EDITOR para o cadastro pelo
 * sistema conseguir gravar na planilha.
 */
export function criarAuth(
  keyFile: string | undefined = process.env.RPA_GOOGLE_KEY_FILE,
  scopes: string[] = ESCOPOS,
): GoogleAuth {
  if (!keyFile) {
    throw new Error(
      'RPA_GOOGLE_KEY_FILE não definido. Aponte para o JSON da Service Account (ver .env.example).',
    );
  }
  return new GoogleAuth({ keyFile, scopes });
}
