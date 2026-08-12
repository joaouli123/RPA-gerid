import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Tela "Codigo numerico" do CAS (o segundo fator do GERID).
 *
 * O DOM real dessa tela tem DOIS submits lado a lado: "Entrar"
 * (_eventId_submit) e "Reiniciar Dispositivo MFA"
 * (_eventId_requestDeviceReset). Um clique no segundo despareia o Google
 * Authenticator do titular — e ai ninguem mais entra no sistema ate refazer o
 * cadastro do dispositivo. Por isso o teste nao olha so "funciona": ele trava
 * o que o robo NAO pode fazer.
 *
 * Tambem trava a regra do codigo: 6 digitos que o operador leu no celular dele
 * nao podem sobrar em log nem em disco.
 */

async function lerBackground(): Promise<string> {
  return readFile(path.join(process.cwd(), 'extensao-gerid', 'background.js'), 'utf8');
}

describe('codigo de 6 digitos na tela do CAS', () => {
  it('nunca aciona o "Reiniciar Dispositivo MFA"', async () => {
    const codigo = await lerBackground();
    const acionamentos = codigo.match(/_eventId_requestDeviceReset/g) ?? [];

    // A unica mencao permitida e o comentario que explica por que nao se toca.
    expect(acionamentos).toHaveLength(1);
    expect(codigo).toMatch(/NUNCA _eventId_requestDeviceReset/);
    expect(codigo).not.toMatch(/requestDeviceReset["'\]]\s*\)?\s*[;,]?\s*\.?click/);
    expect(codigo).not.toMatch(/querySelector\([^)]*requestDeviceReset/);
  });

  it('digita no campo do codigo e envia pelo submit "Entrar"', async () => {
    const codigo = await lerBackground();

    expect(codigo).toMatch(/#token, input\[name="token"\]/);
    expect(codigo).toMatch(/input\[name="_eventId_submit"\]/);
    expect(codigo).toMatch(/enviar\.click\(\)/);
  });

  it('nao sobrescreve o campo quando o operador ja esta digitando', async () => {
    const codigo = await lerBackground();
    expect(codigo).toMatch(/return 'operador_digitando'/);
  });

  it('pede o codigo ao painel e busca a resposta pelo id do desafio', async () => {
    const codigo = await lerBackground();
    expect(codigo).toMatch(/\/api\/ext\/login-2fa/);
    expect(codigo).toMatch(/login-2fa\?desafio=\$\{encodeURIComponent\(desafio\)\}/);
  });

  it('nunca grava o codigo em log nem em storage', async () => {
    const fonte = await lerBackground();

    // sendLog e chrome.storage sao as duas saidas persistentes do worker.
    // Nenhuma delas pode receber a VARIAVEL que carrega os digitos — a palavra
    // "codigo" solta em texto de mensagem e outra coisa e pode aparecer.
    expect(fonte).not.toMatch(/sendLog\(\s*codigo\b/);
    expect(fonte).not.toMatch(/\$\{\s*codigo\s*\}/);
    expect(fonte).not.toMatch(/storage\.local\.set\(\{[^}]*\bcodigo\b/);
    // E nunca viaja como argumento de chamada nenhuma — heartbeat, status,
    // notificacao. A UNICA travessia permitida e `args: [codigo]`, que entrega
    // os digitos direto ao campo da pagina e morre ali.
    expect(fonte).not.toMatch(/[,(]\s*codigo\s*[,)]/);
    expect(fonte).toMatch(/args: \[codigo\]/);
  });

  it('checa o codigo ANTES do debounce do certificado', async () => {
    const codigo = await lerBackground();
    const inicio = codigo.indexOf('async function pedirAutorizacaoNoCelular');
    expect(inicio).toBeGreaterThan(-1);

    const corpo = codigo.slice(inicio, inicio + 1200);
    const posMfa = corpo.indexOf('resolverCodigoMfa(');
    const posDebounce = corpo.indexOf('CHAVE_ULTIMO_CERTIFICADO');

    // A tela do codigo aparece DENTRO dos 3 minutos de debounce do SafeID.
    // Invertida a ordem, o robo sairia calado justamente quando tem o que fazer.
    expect(posMfa).toBeGreaterThan(-1);
    expect(posDebounce).toBeGreaterThan(posMfa);
  });

  it('continua sem tocar em usuario e senha', async () => {
    const fonte = await lerBackground();

    // Os dois so podem aparecer no comentario que promete nao toca-los.
    expect(fonte).not.toMatch(/querySelector\([^)]*#(username|password)/);
    expect(fonte).not.toMatch(/getElementById\(\s*['"](username|password)['"]/);
  });
});
