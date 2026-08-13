import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Consulta que não respondeu não pode virar "pode protocolar".
 *
 * Em 13/08/2026 o POST da consulta voltou 400, a tela ficou exatamente como
 * estava e o robô leu zero linha. Zero linha é o que ele veria também se a
 * pessoa nunca tivesse pedido nada — e foi essa a leitura: anunciou "não tem
 * BPC em andamento. Pode protocolar", com a confiança de quem conferiu.
 * Naquele caso a pessoa realmente não tinha nada. Sorte não é mecanismo, e a
 * pergunta é a mais cara de errar do robô inteiro: liberar por engano abre um
 * segundo requerimento no nome de uma pessoa real.
 *
 * O que este teste tranca são as DUAS metades da correção, porque uma sem a
 * outra seria pior do que o defeito:
 *   1. sem confirmação, a frase "pode protocolar" não é dita;
 *   2. e mesmo assim o caso É preenchido — consulta indisponível não pode
 *      virar motivo para não atender ninguém. O bloqueio do próprio portal
 *      ("pedido X em aberto") continua de pé como segunda barreira.
 *
 * ⚠️ Todo CPF e nome aqui é FICTÍCIO.
 */
describe('consulta que nao confirmou', () => {
  it('nao diz "pode protocolar", mas tambem nao deixa o caso sem atendimento', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const statusEnviados: any[] = [];
    const casosExecutados: string[] = [];
    let terminou = false;

    const aba = {
      id: 41,
      active: true,
      status: 'complete',
      url: 'https://atendimento.inss.gov.br/requerimentos',
    };
    const abaTarefas = { id: 42, status: 'complete', url: 'https://atendimento.inss.gov.br/tarefas' };

    const chrome = {
      runtime: {
        onMessage: { addListener: (fn: (mensagem: any) => void) => listeners.push(fn) },
        onStartup: { addListener: () => undefined },
        onInstalled: { addListener: () => undefined },
        sendMessage: async (mensagem: any) => {
          if (mensagem?.action === 'finished') terminou = true;
          return undefined;
        },
      },
      action: { setBadgeBackgroundColor: async () => undefined, setBadgeText: async () => undefined },
      alarms: { create: () => undefined, onAlarm: { addListener: () => undefined } },
      storage: {
        local: {
          get: async (chaves: string[]) => Object.fromEntries(
            chaves.filter((chave) => chave in storage).map((chave) => [chave, storage[chave]]),
          ),
          set: async (valores: Record<string, any>) => Object.assign(storage, valores),
          remove: async (chave: string) => { delete storage[chave]; },
        },
      },
      tabs: {
        query: async () => [aba],
        get: async (id: number) => (id === abaTarefas.id ? abaTarefas : aba),
        create: async () => abaTarefas,
        remove: async () => undefined,
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          const arg = opcoes.args?.[0];

          if (arg && typeof arg === 'object' && arg.cpf) {
            casosExecutados.push(arg.cpf);
            return [{ result: { status: 'sucesso', protocolo: '900000055' } }];
          }

          // O 400 do GERID visto de dentro da página: nenhuma linha, e nenhuma
          // marca de que a busca chegou a responder. É a ausência de
          // `buscaConfirmada` que carrega a informação.
          if (typeof arg === 'string' && /^\d{11}$/.test(arg)) {
            return [{ result: { linhas: [], aviso: 'A lista nao mudou depois do Buscar; pode nao ter filtrado.' } }];
          }
          return [{ result: true }];
        },
      },
    };

    const fetch = async (url: string, opcoes: any = {}) => {
      if (url.endsWith('/api/ext/fila')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sucesso: true,
            idExecucao: 'exec-nao-confirmada',
            casos: [{
              nome: 'Pessoa Ficticia',
              cpf: '55555555555',
              dados: { cliente: { cpf: '55555555555' }, grupoFamiliar: { integrantes: [] } },
              configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
              anexos: [],
            }],
          }),
        };
      }
      if (url.endsWith('/api/ext/heartbeat')) {
        return { ok: true, status: 200, json: async () => ({ sucesso: true }) };
      }
      if (url.endsWith('/api/ext/status')) {
        statusEnviados.push(JSON.parse(opcoes.body));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            sucesso: true,
            comprovante: { painel: true, drive: true, aviso: '' },
          }),
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };

    const codigo = await readFile(path.join(process.cwd(), 'extensao-gerid', 'background.js'), 'utf8');
    vm.runInNewContext(codigo, {
      chrome,
      fetch,
      AbortController,
      Uint8Array,
      btoa: (valor: string) => Buffer.from(valor, 'binary').toString('base64'),
      console,
      URL,
      setTimeout,
      clearTimeout,
      Date,
      Promise,
    });

    for (const listener of listeners) {
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: false });
    }

    const limite = Date.now() + 40_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(terminou, 'a fila nao encerrou dentro do tempo').toBe(true);

    const logs = (storage.logsGerid ?? []).map((item: any) => item.mensagem).join('\n');

    // 1. A frase que não pode ser dita sem conferência.
    expect(logs).not.toMatch(/Pode protocolar/i);
    expect(logs).toMatch(/nao confirmou a consulta/i);

    // 2. E o atendimento aconteceu do mesmo jeito.
    expect(casosExecutados).toEqual(['55555555555']);
    expect(statusEnviados.find((s) => s.cpf === '55555555555')).toMatchObject({ status: 'sucesso' });
  }, 60_000);
});
