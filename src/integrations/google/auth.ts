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
 * Limpa os estragos comuns de copiar/colar a credencial num painel web.
 *
 * O que já vimos acontecer: o painel envolve o valor em aspas, a pessoa cola
 * junto o `NOME=` da variável, ou sobra espaço/quebra de linha nas pontas.
 * Nada disso muda a credencial em si, então é seguro corrigir em vez de
 * recusar — o que NÃO se corrige é conteúdo que não seja a credencial.
 */
function limparColagem(bruto: string): string {
  let v = bruto.trim();

  // "RPA_GOOGLE_CREDENTIALS={...}" -> "{...}"
  v = v.replace(/^RPA_GOOGLE_CREDENTIALS\s*=\s*/, '').trim();

  // Aspas nas duas pontas (o Raw Editor do Railway escreve assim).
  const primeira = v[0];
  if ((primeira === '"' || primeira === "'") && v.at(-1) === primeira) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Converte a credencial em objeto, aceitando JSON ou base64.
 *
 * O base64 existe porque JSON tem aspas, chaves e `=` — caracteres que vários
 * painéis de variável tentam interpretar. Base64 é só letra e número, então
 * atravessa qualquer campo sem se machucar.
 */
function lerCredencial(bruto: string): Record<string, unknown> {
  const v = limparColagem(bruto);

  const texto = v.startsWith('{') ? v : decodificarBase64(v);

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    // Diagnóstico sem vazar a chave: só tamanho e as pontas.
    throw new Error(
      `RPA_GOOGLE_CREDENTIALS não é um JSON válido (${v.length} caracteres, ` +
        `começa com "${v.slice(0, 1)}" e termina com "${v.slice(-1)}"). ` +
        'Esperado: o conteúdo do arquivo da service account, começando com "{". ' +
        'Se o painel estraga a colagem, use RPA_GOOGLE_CREDENTIALS em base64.',
    );
  }

  if (!credentials.private_key || !credentials.client_email) {
    throw new Error(
      'RPA_GOOGLE_CREDENTIALS é um JSON, mas não parece ser o arquivo da service account: ' +
        'faltam "private_key" e/ou "client_email".',
    );
  }
  return credentials;
}

function decodificarBase64(v: string): string {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(v)) {
    throw new Error(
      `RPA_GOOGLE_CREDENTIALS não é JSON nem base64 (${v.length} caracteres, ` +
        `começa com "${v.slice(0, 1)}"). Cole o conteúdo do arquivo da service account.`,
    );
  }
  return Buffer.from(v.replace(/\s+/g, ''), 'base64').toString('utf8');
}

/**
 * Cria o cliente de autenticação da Service Account.
 *
 * Aceita a credencial de duas formas:
 *   1. `RPA_GOOGLE_CREDENTIALS` — o JSON inteiro (ou o mesmo JSON em base64)
 *      numa variável de ambiente. É o jeito usado em servidor (Railway etc.),
 *      onde não dá para subir arquivo de segredo junto com o código.
 *   2. `RPA_GOOGLE_KEY_FILE` — caminho para o arquivo .json (uso local).
 *
 * A pasta "Protocolo INSS" e a planilha precisam estar compartilhadas com o
 * e-mail da Service Account, com permissão de EDITOR (o cadastro grava nela).
 */
export function criarAuth(
  keyFile: string | undefined = process.env.RPA_GOOGLE_KEY_FILE,
  scopes: string[] = ESCOPOS,
): GoogleAuth {
  const bruto = process.env.RPA_GOOGLE_CREDENTIALS?.trim();

  if (bruto) return new GoogleAuth({ credentials: lerCredencial(bruto), scopes });

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
