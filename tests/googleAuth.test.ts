import { afterEach, describe, expect, it } from 'vitest';
import { criarAuth, temCredencial } from '../src/integrations/google/auth';

/**
 * A credencial chega por variável de ambiente, colada à mão num painel web.
 * Estes testes fixam o que o carregador tolera (estrago de colagem) e o que
 * ele recusa (conteúdo que não é a credencial) — a diferença importa: aceitar
 * lixo silenciosamente faria o robô falhar bem mais tarde, sem explicação.
 */

const CREDENCIAL = {
  type: 'service_account',
  project_id: 'projeto-de-teste',
  private_key_id: 'abc123',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----\n',
  client_email: 'robo@projeto-de-teste.iam.gserviceaccount.com',
  client_id: '123456789',
};

const JSON_UMA_LINHA = JSON.stringify(CREDENCIAL);

function comEnv(valor: string | undefined): void {
  if (valor === undefined) delete process.env.RPA_GOOGLE_CREDENTIALS;
  else process.env.RPA_GOOGLE_CREDENTIALS = valor;
}

afterEach(() => {
  comEnv(undefined);
  delete process.env.RPA_GOOGLE_KEY_FILE;
});

describe('credencial do Google — colagem', () => {
  it('aceita o JSON em uma linha', () => {
    comEnv(JSON_UMA_LINHA);
    expect(() => criarAuth(undefined)).not.toThrow();
  });

  it('aceita o JSON formatado, com quebras de linha', () => {
    comEnv(JSON.stringify(CREDENCIAL, null, 2));
    expect(() => criarAuth(undefined)).not.toThrow();
  });

  it('aceita base64 (imune a painel que mexe em aspas e chaves)', () => {
    comEnv(Buffer.from(JSON_UMA_LINHA, 'utf8').toString('base64'));
    expect(() => criarAuth(undefined)).not.toThrow();
  });

  it('aceita base64 quebrado em várias linhas', () => {
    const b64 = Buffer.from(JSON_UMA_LINHA, 'utf8').toString('base64');
    comEnv(`${b64.slice(0, 40)}\n${b64.slice(40)}`);
    expect(() => criarAuth(undefined)).not.toThrow();
  });

  it('tira aspas que o painel põe em volta do valor', () => {
    comEnv(`"${JSON_UMA_LINHA}"`);
    expect(() => criarAuth(undefined)).not.toThrow();
    comEnv(`'${JSON_UMA_LINHA}'`);
    expect(() => criarAuth(undefined)).not.toThrow();
  });

  it('tira o nome da variável colado junto por engano', () => {
    comEnv(`RPA_GOOGLE_CREDENTIALS=${JSON_UMA_LINHA}`);
    expect(() => criarAuth(undefined)).not.toThrow();
  });

  it('tira espaço e quebra de linha das pontas', () => {
    comEnv(`\n  ${JSON_UMA_LINHA}  \n`);
    expect(() => criarAuth(undefined)).not.toThrow();
  });
});

describe('credencial do Google — recusa', () => {
  it('recusa JSON válido que não é service account, dizendo o que falta', () => {
    comEnv(JSON.stringify({ type: 'service_account', project_id: 'x' }));
    expect(() => criarAuth(undefined)).toThrow(/private_key.*client_email|client_email/);
  });

  it('recusa texto solto e informa tamanho e pontas, sem vazar o conteúdo', () => {
    comEnv('isto aqui não é credencial nenhuma');
    expect(() => criarAuth(undefined)).toThrow(/não é JSON nem base64/);
  });

  it('a mensagem de erro nunca inclui a chave privada', () => {
    // JSON truncado: parece credencial, mas não fecha.
    comEnv(JSON_UMA_LINHA.slice(0, -10));
    try {
      criarAuth(undefined);
      expect.unreachable('deveria ter falhado');
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      expect(msg).not.toContain('BEGIN PRIVATE KEY');
      expect(msg).not.toContain('MIIabc');
      expect(msg).toMatch(/caracteres/);
    }
  });

  it('sem credencial nenhuma, explica as duas formas de configurar', () => {
    expect(() => criarAuth(undefined)).toThrow(/RPA_GOOGLE_CREDENTIALS.*RPA_GOOGLE_KEY_FILE/s);
  });
});

describe('temCredencial', () => {
  it('é false sem nada configurado', () => {
    expect(temCredencial()).toBe(false);
  });

  it('é true com qualquer um dos dois caminhos', () => {
    comEnv(JSON_UMA_LINHA);
    expect(temCredencial()).toBe(true);
    comEnv(undefined);
    process.env.RPA_GOOGLE_KEY_FILE = './secrets/service-account.json';
    expect(temCredencial()).toBe(true);
  });
});
