import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * A pausa vale ENTRE casos.
 *
 * O caso que já está na tela do GERID precisa terminar: abandoná-lo no meio
 * deixaria um requerimento pela metade — ou pararia logo depois do Confirmar,
 * sem ler o protocolo, que foi exatamente o buraco que engoliu o número da
 * Camila. Este teste fixa as duas metades da regra: o caso em andamento vai
 * até o fim e reporta, e o SEGUINTE não chega a começar.
 */
describe('extensao Gerid - pausa vinda do painel', () => {
  it('termina o caso em andamento e nao inicia o proximo', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const statusEnviados: any[] = [];
    const heartbeats: any[] = [];
    let terminou = false;

    const aba = {
      id: 77,
      active: true,
      status: 'complete',
      url: 'https://atendimento.inss.gov.br/requerimentos',
    };

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
      // `tabs.create` fica de fora de proposito: sem ele a conferencia na lista
      // de tarefas falha, e o caso protocolado tem de sobreviver a isso.
      tabs: {
        query: async () => [aba],
        get: async () => aba,
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => opcoes.args
          ? [{ result: { status: 'sucesso', protocolo: '1555659503' } }]
          : [{ result: true }],
      },
    };

    function caso(nome: string, cpf: string) {
      return {
        nome,
        cpf,
        dados: { cliente: { cpf }, grupoFamiliar: { integrantes: [] } },
        configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
        anexos: [],
      };
    }

    const fetch = async (url: string, opcoes: any = {}) => {
      if (url.endsWith('/api/ext/fila')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sucesso: true,
            idExecucao: 'exec-pausa',
            casos: [caso('Primeira Pessoa', '11111111111'), caso('Segunda Pessoa', '22222222222')],
          }),
        };
      }
      if (url.endsWith('/api/ext/heartbeat')) {
        heartbeats.push(JSON.parse(opcoes.body));
        // O operador pausa no painel enquanto o primeiro caso roda: o segundo
        // heartbeat ja volta com a pausa ligada.
        const pausada = heartbeats.filter((h) => h.detalheGerid?.startsWith('Proximo caso')).length > 1;
        return { ok: true, status: 200, json: async () => ({ sucesso: true, pausada }) };
      }
      if (url.endsWith('/api/ext/status')) {
        statusEnviados.push(JSON.parse(opcoes.body));
        return { ok: true, status: 200, text: async () => JSON.stringify({ sucesso: true }) };
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
      // `URL` e global no service worker MV3; o sandbox precisa oferecer o mesmo.
      URL,
      setTimeout,
      clearTimeout,
      Date,
      Promise,
    });

    for (const listener of listeners) {
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: false });
    }

    const limite = Date.now() + 5_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(terminou, 'a fila nao encerrou dentro do tempo').toBe(true);

    // O primeiro caso foi ate o fim e reportou o protocolo. O segundo nao
    // gerou resultado nenhum — nem sucesso, nem erro inventado.
    expect(statusEnviados).toHaveLength(1);
    expect(statusEnviados[0]).toMatchObject({
      cpf: '11111111111',
      status: 'sucesso',
      protocolo: '1555659503',
    });

    // A execucao continua preservada e SEM caso em andamento: quem sobrou fica
    // pendente no servidor, para retomar de onde parou.
    expect(storage.execucaoAtivaGerid).toMatchObject({ idExecucao: 'exec-pausa' });
    expect(storage.execucaoAtivaGerid.cpfAtual).toBeUndefined();

    const logs = (storage.logsGerid ?? []).map((item: any) => item.mensagem).join('\n');
    expect(logs).toMatch(/PAUSADA/);
    expect(logs).toMatch(/Segunda Pessoa/);
  }, 20_000);

  it('nao abre o GERID quando a fila ja chega pausada', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const urlsChamadas: string[] = [];
    let terminou = false;

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
        query: async () => { throw new Error('a extensao nao deveria procurar aba com a fila pausada'); },
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async () => { throw new Error('nada deveria rodar na pagina com a fila pausada'); },
      },
    };

    const fetch = async (url: string) => {
      urlsChamadas.push(url);
      if (url.endsWith('/api/ext/fila')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sucesso: true,
            idExecucao: 'exec-pausa',
            pausada: true,
            pendentes: 2,
            casos: [],
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
      // `URL` e global no service worker MV3; o sandbox precisa oferecer o mesmo.
      URL,
      setTimeout,
      clearTimeout,
      Date,
      Promise,
    });

    for (const listener of listeners) {
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: false });
    }

    const limite = Date.now() + 5_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // So consultou a fila: nao preparou fila nova, nao abriu aba, nao reportou
    // status. Clicar em Iniciar durante a pausa nao pode furar a pausa.
    expect(urlsChamadas.every((url) => url.endsWith('/api/ext/fila'))).toBe(true);
    const logs = (storage.logsGerid ?? []).map((item: any) => item.mensagem).join('\n');
    expect(logs).toMatch(/PAUSADA/);
  }, 20_000);
});
