import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('extensão Gerid — service worker', () => {
  it('mantém a aba fixada, baixa anexos e registra a revisão em segundo plano', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const statusEnviados: any[] = [];
    const scriptsExecutados: any[] = [];

    const chrome = {
      runtime: {
        onMessage: { addListener: (fn: (mensagem: any) => void) => listeners.push(fn) },
        onStartup: { addListener: () => undefined },
        sendMessage: async () => undefined,
      },
      storage: {
        local: {
          get: async (chaves: string[]) => Object.fromEntries(chaves.filter((c) => c in storage).map((c) => [c, storage[c]])),
          set: async (valores: Record<string, any>) => Object.assign(storage, valores),
          remove: async (chave: string) => { delete storage[chave]; },
        },
      },
      tabs: {
        query: async () => [{ id: 77, active: true, status: 'complete', url: 'https://atendimento.inss.gov.br/tarefas' }],
        get: async () => ({ id: 77, active: true, status: 'complete', url: 'https://atendimento.inss.gov.br/tarefas' }),
        update: async () => ({ id: 77, status: 'complete', url: 'https://atendimento.inss.gov.br/tarefas' }),
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          scriptsExecutados.push(opcoes);
          if (!opcoes.args) return [{ result: true }];
          return [{ result: { status: 'revisao', erro: 'Preenchido até a revisão final.' } }];
        },
      },
    };

    const fetch = async (url: string, opcoes: any = {}) => {
      if (url.endsWith('/api/ext/fila')) {
        return {
          ok: true,
          json: async () => ({
            sucesso: true,
            idExecucao: 'execucao-teste',
            casos: [{
              nome: 'Pessoa de Teste',
              cpf: '12345678901',
              dados: { cliente: { cpf: '12345678901' }, grupoFamiliar: { integrantes: [] } },
              configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
              anexos: [{ id: 'arquivo-1', nome: 'documento.pdf', mimeType: 'application/pdf', tipo: 'DOCUMENTOS_PESSOAIS' }],
            }],
          }),
        };
      }
      if (url.includes('/api/ext/arquivo')) {
        return { ok: true, arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer };
      }
      if (url.endsWith('/api/ext/status')) {
        statusEnviados.push(JSON.parse(opcoes.body));
        return { ok: true };
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

    const limite = Date.now() + 5_000;
    while (statusEnviados.length === 0 && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(statusEnviados).toHaveLength(1);
    expect(statusEnviados[0]).toMatchObject({
      idExecucao: 'execucao-teste',
      cpf: '12345678901',
      status: 'revisao',
    });
    expect(scriptsExecutados.some((execucao) => execucao.target?.tabId === 77 && execucao.args)).toBe(true);
    expect(scriptsExecutados.find((execucao) => execucao.args)?.args[0].anexos[0]).toMatchObject({
      nome: 'documento.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERg==',
    });
    expect(storage.execucaoAtivaGerid).toBeUndefined();
  });
});
