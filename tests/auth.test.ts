import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { credenciaisValidas, gerarHashSenha } from '../lib/server/auth';
import { criarSessao, lerSessao, DURACAO_SESSAO_MS } from '../lib/server/sessao';
import { checarLimite, registrarFalha, limparTentativas, resetarLimites } from '../lib/server/limiteTentativas';

const EMAIL = 'pessoa@exemplo.com';
const SENHA = 'senha-de-teste-forte-123';

beforeAll(async () => {
  process.env.RPA_AUTH_EMAIL = EMAIL;
  process.env.RPA_AUTH_SENHA_HASH = await gerarHashSenha(SENHA, randomBytes(16).toString('hex'));
  process.env.RPA_SESSAO_SECRET = randomBytes(48).toString('hex');
});

describe('credenciais', () => {
  it('aceita e-mail e senha corretos', async () => {
    await expect(credenciaisValidas(EMAIL, SENHA)).resolves.toBe(true);
  });

  it('recusa senha errada', async () => {
    await expect(credenciaisValidas(EMAIL, 'outra-senha')).resolves.toBe(false);
  });

  it('recusa e-mail errado', async () => {
    await expect(credenciaisValidas('intruso@exemplo.com', SENHA)).resolves.toBe(false);
  });

  it('e-mail não diferencia maiúsculas nem espaços', async () => {
    await expect(credenciaisValidas(`  ${EMAIL.toUpperCase()} `, SENHA)).resolves.toBe(true);
  });

  it('a senha em texto puro não fica guardada em lugar nenhum', () => {
    expect(process.env.RPA_AUTH_SENHA_HASH).not.toContain(SENHA);
    expect(process.env.RPA_AUTH_SENHA_HASH).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });
});

describe('sessão', () => {
  it('cria e valida um cookie assinado', async () => {
    const cookie = await criarSessao(EMAIL);
    const payload = await lerSessao(cookie);
    expect(payload?.sub).toBe(EMAIL);
  });

  it('recusa cookie adulterado', async () => {
    const cookie = await criarSessao(EMAIL);
    const [corpo, assinatura] = cookie.split('.');
    // Troca o "sub" mantendo a assinatura antiga.
    const forjado =
      Buffer.from(JSON.stringify({ sub: 'intruso@exemplo.com', exp: Date.now() + 60000 }))
        .toString('base64url') + '.' + assinatura;
    expect(await lerSessao(forjado)).toBeNull();
    expect(corpo).toBeTruthy();
  });

  it('recusa cookie expirado', async () => {
    const antigo = await criarSessao(EMAIL, Date.now() - DURACAO_SESSAO_MS - 1000);
    expect(await lerSessao(antigo)).toBeNull();
  });

  it('recusa cookie vazio ou sem assinatura', async () => {
    expect(await lerSessao(undefined)).toBeNull();
    expect(await lerSessao('')).toBeNull();
    expect(await lerSessao('semponto')).toBeNull();
  });

  it('cookie assinado com outro segredo não vale', async () => {
    const cookie = await criarSessao(EMAIL);
    const original = process.env.RPA_SESSAO_SECRET;
    process.env.RPA_SESSAO_SECRET = randomBytes(48).toString('hex');
    expect(await lerSessao(cookie)).toBeNull();
    process.env.RPA_SESSAO_SECRET = original;
  });
});

describe('limite de tentativas', () => {
  beforeEach(() => resetarLimites());

  it('bloqueia após 5 falhas e informa o tempo', () => {
    for (let i = 0; i < 4; i++) {
      const e = registrarFalha('1.2.3.4');
      expect(e.bloqueado).toBe(false);
    }
    const quinta = registrarFalha('1.2.3.4');
    expect(quinta.bloqueado).toBe(true);
    expect(quinta.segundosParaLiberar).toBeGreaterThan(0);
  });

  it('login bem-sucedido zera o contador', () => {
    registrarFalha('5.6.7.8');
    registrarFalha('5.6.7.8');
    limparTentativas('5.6.7.8');
    expect(checarLimite('5.6.7.8').restantes).toBe(5);
  });

  it('bloqueio de um IP não afeta outro', () => {
    for (let i = 0; i < 5; i++) registrarFalha('9.9.9.9');
    expect(checarLimite('9.9.9.9').bloqueado).toBe(true);
    expect(checarLimite('8.8.8.8').bloqueado).toBe(false);
  });

  it('libera depois da janela de 15 min', () => {
    const agora = Date.now();
    for (let i = 0; i < 5; i++) registrarFalha('7.7.7.7', agora);
    expect(checarLimite('7.7.7.7', agora).bloqueado).toBe(true);
    expect(checarLimite('7.7.7.7', agora + 16 * 60 * 1000).bloqueado).toBe(false);
  });
});
