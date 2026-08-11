import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('extensao Gerid - recuperacao de falhas', () => {
  it('preserva a revisao preenchida quando o servidor falha ao registrar o status', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const alarmes: string[] = [];

    const chrome = {
      runtime: {
        onMessage: { addListener: (fn: (mensagem: any) => void) => listeners.push(fn) },
        onStartup: { addListener: () => undefined },
        onInstalled: { addListener: () => undefined },
        sendMessage: async () => undefined,
      },
      action: {
        setBadgeBackgroundColor: async () => undefined,
        setBadgeText: async () => undefined,
      },
      alarms: {
        create: (nome: string) => alarmes.push(nome),
        onAlarm: { addListener: () => undefined },
      },
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
        query: async () => [{
          id: 77,
          active: true,
          status: 'complete',
          url: 'https://atendimento.inss.gov.br/requerimentos',
        }],
        get: async () => ({
          id: 77,
          active: true,
          status: 'complete',
          url: 'https://atendimento.inss.gov.br/requerimentos',
        }),
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => opcoes.args
          ? [{ result: { status: 'revisao', erro: 'Pronto para revisao.' } }]
          : [{ result: true }],
      },
    };

    const fetch = async (url: string) => {
      if (url.endsWith('/api/ext/fila')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sucesso: true,
            idExecucao: 'exec-rede',
            casos: [{
              nome: 'Pessoa de Teste',
              cpf: '12345678901',
              dados: { cliente: { cpf: '12345678901' }, grupoFamiliar: { integrantes: [] } },
              configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
              anexos: [],
            }],
          }),
        };
      }
      if (url.endsWith('/api/ext/heartbeat')) return { ok: true, status: 200 };
      if (url.endsWith('/api/ext/status')) {
        return {
          ok: false,
          status: 503,
          text: async () => JSON.stringify({ erro: 'Servidor temporariamente indisponivel.' }),
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
      setTimeout,
      clearTimeout,
      Date,
      Promise,
    });

    for (const listener of listeners) {
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: true });
    }

    const limite = Date.now() + 2_000;
    while (!alarmes.includes('retomarExecucaoGerid') && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(storage.execucaoAtivaGerid).toMatchObject({
      idExecucao: 'exec-rede',
      cpfAtual: '12345678901',
      aguardandoConfirmacao: true,
      tentativasRetomada: 1,
    });
    expect(alarmes).toContain('retomarExecucaoGerid');
    expect(storage.logsGerid.some((item: any) => item.mensagem.includes('Servidor temporariamente'))).toBe(true);
  });
});
