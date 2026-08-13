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
    const urlsAtualizadas: string[] = [];
    let downloadsAtivos = 0;
    let maxDownloadsAtivos = 0;
    let filaPreparada = false;
    let aoAtualizarAba: ((id: number, info: any, tab: any) => void) | undefined;

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
        query: async () => [{ id: 77, active: true, status: 'complete', url: 'https://atendimento.inss.gov.br/requerimentos' }],
        get: async () => ({ id: 77, active: true, status: 'complete', url: 'https://atendimento.inss.gov.br/requerimentos' }),
        update: async (id: number, opcoes: { url: string }) => {
          urlsAtualizadas.push(opcoes.url);
          setTimeout(() => aoAtualizarAba?.(id, { status: 'complete' }, {
            id,
            status: 'complete',
            url: opcoes.url,
          }), 0);
          return { id, status: 'complete', url: opcoes.url };
        },
        onUpdated: {
          addListener: (fn: (id: number, info: any, tab: any) => void) => { aoAtualizarAba = fn; },
          removeListener: (fn: (id: number, info: any, tab: any) => void) => {
            if (aoAtualizarAba === fn) aoAtualizarAba = undefined;
          },
        },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          scriptsExecutados.push(opcoes);
          if (String(opcoes.func).includes('__GERID_RPA_CONTENT_BUILD__')) {
            return [{ result: false }];
          }
          if (!opcoes.args) return [{ result: true }];
          return [{ result: { status: 'revisao', erro: 'Preenchido até a revisão final.' } }];
        },
      },
    };

    const fetch = async (url: string, opcoes: any = {}) => {
      if (url.endsWith('/api/ext/fila')) {
        return {
          ok: true,
          json: async () => filaPreparada ? ({
            sucesso: true,
            idExecucao: 'execucao-teste',
            casos: [{
              nome: 'Pessoa de Teste',
              cpf: '12345678901',
              dados: { cliente: { cpf: '12345678901' }, grupoFamiliar: { integrantes: [] } },
              configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
              anexos: Array.from({ length: 5 }, (_, indice) => ({
                id: `arquivo-${indice + 1}`,
                nome: `documento-${indice + 1}.pdf`,
                mimeType: 'application/pdf',
                tipo: 'DOCUMENTOS_PESSOAIS',
              })),
            }],
          }) : ({ sucesso: true, idExecucao: null, casos: [] }),
        };
      }
      if (url.endsWith('/api/ext/iniciar')) {
        filaPreparada = true;
        return { ok: true, json: async () => ({ sucesso: true, idExecucao: 'execucao-teste', total: 1 }) };
      }
      if (url.includes('/api/ext/arquivo')) {
        downloadsAtivos++;
        maxDownloadsAtivos = Math.max(maxDownloadsAtivos, downloadsAtivos);
        await new Promise((resolve) => setTimeout(resolve, 30));
        downloadsAtivos--;
        return { ok: true, arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer };
      }
      if (url.endsWith('/api/ext/status')) {
        statusEnviados.push(JSON.parse(opcoes.body));
        return { ok: true };
      }
      if (url.endsWith('/api/ext/heartbeat')) {
        return { ok: true, status: 200 };
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
    const execucaoCaso = scriptsExecutados.find((execucao) => execucao.args?.length === 1);
    expect(execucaoCaso).toMatchObject({ target: { tabId: 77 }, world: 'MAIN' });
    expect(scriptsExecutados.some(
      (execucao) => execucao.world === 'MAIN' && execucao.files?.includes('content.js'),
    )).toBe(true);
    expect(execucaoCaso.args[0].anexos[0]).toMatchObject({
      nome: 'documento-1.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERg==',
    });
    expect(execucaoCaso.args[0].anexos.map((item: any) => item.nome))
      .toEqual(Array.from({ length: 5 }, (_, indice) => `documento-${indice + 1}.pdf`));
    expect(maxDownloadsAtivos).toBe(4);
    expect(urlsAtualizadas).toEqual([]);
    expect(filaPreparada).toBe(true);
    expect(storage.execucaoAtivaGerid).toMatchObject({
      idExecucao: 'execucao-teste',
      cpfAtual: '12345678901',
      aguardandoConfirmacao: true,
    });
  });

  it('recarrega a rota atual antes de retomar um caso interrompido pela navegação', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const urlsAtualizadas: string[] = [];
    const abasRecarregadas: number[] = [];
    const statusEnviados: any[] = [];
    const alarmesCriados: string[] = [];
    let aoAlarme: ((alarme: { name: string }) => void) | undefined;
    let tentativasDePreenchimento = 0;

    const chrome = {
      runtime: {
        onMessage: { addListener: (fn: (mensagem: any) => void) => listeners.push(fn) },
        onStartup: { addListener: () => undefined },
        sendMessage: async () => undefined,
      },
      alarms: {
        create: (nome: string) => { alarmesCriados.push(nome); },
        onAlarm: { addListener: (fn: (alarme: { name: string }) => void) => { aoAlarme = fn; } },
      },
      storage: {
        local: {
          get: async (chaves: string[]) =>
            Object.fromEntries(chaves.filter((chave) => chave in storage).map((chave) => [chave, storage[chave]])),
          set: async (valores: Record<string, any>) => Object.assign(storage, valores),
          remove: async (chave: string) => { delete storage[chave]; },
        },
      },
      tabs: {
        query: async () => [{ id: 77, active: false, status: 'complete', url: 'https://atendimento.inss.gov.br/requerimentos' }],
        get: async () => ({ id: 77, active: false, status: 'complete', url: 'https://atendimento.inss.gov.br/requerimentos' }),
        update: async (_id: number, opcoes: { url: string }) => {
          urlsAtualizadas.push(opcoes.url);
          return { id: 77, status: 'complete', url: opcoes.url };
        },
        reload: async (id: number) => { abasRecarregadas.push(id); },
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          if (!opcoes.args) return [{ result: true }];
          tentativasDePreenchimento++;
          if (tentativasDePreenchimento <= 2) {
            return [{ result: {
              status: 'erro',
              erro: 'A lista de serviços do Gerid não exibiu o BPC à Pessoa com Deficiência.',
            } }];
          }
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
            idExecucao: 'execucao-retomada',
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
      if (url.endsWith('/api/ext/status')) {
        statusEnviados.push(JSON.parse(opcoes.body));
        return { ok: true };
      }
      if (url.endsWith('/api/ext/heartbeat')) {
        return { ok: true, status: 200 };
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
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: true });
    }

    const limiteAlarme = Date.now() + 2_000;
    while (alarmesCriados.length === 0 && Date.now() < limiteAlarme) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(alarmesCriados).toEqual(['retomarExecucaoGerid']);
    expect(storage.execucaoAtivaGerid).toBeDefined();

    aoAlarme?.({ name: 'retomarExecucaoGerid' });
    const limiteResultado = Date.now() + 2_000;
    while (statusEnviados.length === 0 && Date.now() < limiteResultado) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(statusEnviados).toHaveLength(1);
    expect(tentativasDePreenchimento).toBe(3);
    expect(abasRecarregadas).toEqual([77]);
    expect(urlsAtualizadas).toEqual([]);
    expect(storage.execucaoAtivaGerid).toMatchObject({
      idExecucao: 'execucao-retomada',
      aguardandoConfirmacao: true,
    });
  });

  it('preserva a fila no CAS e retoma depois do SafeID e MFA', async () => {
    const listeners: Array<(mensagem: any, sender?: any, sendResponse?: (resposta: any) => void) => unknown> = [];
    const listenersAbas: Array<(id: number, info: any, tab: any) => void> = [];
    const storage: Record<string, any> = {};
    const heartbeats: any[] = [];
    const statusEnviados: any[] = [];
    const alarmesCriados: string[] = [];
    const urlsAutenticacao: string[] = [];
    const scriptsControle: any[] = [];
    const abaCas = {
      id: 91,
      active: true,
      status: 'complete',
      url: 'https://geridinss.dataprev.gov.br/cas/login',
    };
    let abas = [abaCas];

    const chrome = {
      runtime: {
        onMessage: { addListener: (fn: (mensagem: any) => void) => listeners.push(fn) },
        onStartup: { addListener: () => undefined },
        sendMessage: async () => undefined,
      },
      action: {
        setBadgeBackgroundColor: async () => undefined,
        setBadgeText: async () => undefined,
      },
      notifications: { create: async () => undefined },
      alarms: {
        create: (nome: string) => { alarmesCriados.push(nome); },
        onAlarm: { addListener: () => undefined },
      },
      storage: {
        local: {
          get: async (chaves: string[]) =>
            Object.fromEntries(chaves.filter((chave) => chave in storage).map((chave) => [chave, storage[chave]])),
          set: async (valores: Record<string, any>) => Object.assign(storage, valores),
          remove: async (chave: string) => { delete storage[chave]; },
        },
      },
      tabs: {
        query: async () => abas,
        get: async (id: number) => abas.find((aba) => aba.id === id),
        create: async () => abaCas,
        update: async (_id: number, opcoes: { url?: string }) => {
          if (opcoes.url) urlsAutenticacao.push(opcoes.url);
          return abaCas;
        },
        remove: async () => undefined,
        reload: async () => undefined,
        onUpdated: {
          addListener: (fn: (id: number, info: any, tab: any) => void) => listenersAbas.push(fn),
          removeListener: () => undefined,
        },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          scriptsControle.push(opcoes);
          if (opcoes.world === 'MAIN' && opcoes.args?.length === 3) {
            return [{ result: {
              ok: true,
              motivo: opcoes.args[0] === 'marcar' ? 'react_click' : 'react_onchange',
            } }];
          }
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
            idExecucao: 'execucao-auth',
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
      if (url.endsWith('/api/ext/heartbeat')) {
        heartbeats.push(JSON.parse(opcoes.body));
        return { ok: true, status: 200 };
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
      // `URL` e global no service worker MV3; o sandbox precisa oferecer o mesmo.
      URL,
      setTimeout,
      clearTimeout,
      Date,
      Promise,
    });

    const respostasControle: any[] = [];
    for (const listener of listeners) {
      listener(
        { action: 'gerid_react_control', tipo: 'combobox', id: 'selectEstadoCivil0', valor: 'Solteiro' },
        { tab: { id: 77 } },
        (resposta) => respostasControle.push(resposta),
      );
    }
    const limiteControle = Date.now() + 1_000;
    while (respostasControle.length === 0 && Date.now() < limiteControle) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(respostasControle).toEqual([{ ok: true, motivo: 'react_onchange' }]);
    expect(scriptsControle).toContainEqual(expect.objectContaining({
      target: { tabId: 77 },
      world: 'MAIN',
      args: ['combobox', 'selectEstadoCivil0', 'Solteiro'],
    }));

    const respostasMarcacaoReact: any[] = [];
    for (const listener of listeners) {
      listener(
        { action: 'gerid_react_control', tipo: 'marcar', id: 'undefined-Nao' },
        { tab: { id: 77 } },
        (resposta) => respostasMarcacaoReact.push(resposta),
      );
    }
    const limiteClique = Date.now() + 1_000;
    while (respostasMarcacaoReact.length === 0 && Date.now() < limiteClique) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(respostasMarcacaoReact).toEqual([{ ok: true, motivo: 'react_click' }]);

    for (const listener of listeners) {
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: true });
    }

    const limitePausa = Date.now() + 2_000;
    while (!storage.execucaoAtivaGerid && Date.now() < limitePausa) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(storage.execucaoAtivaGerid?.idExecucao).toBe('execucao-auth');
    expect(heartbeats.at(-1)?.estadoGerid).toBe('autenticacao_necessaria');
    expect(alarmesCriados).toContain('aguardarAutenticacaoGerid');
    expect(urlsAutenticacao).toContain('https://atendimento.inss.gov.br/requerimentos');
    expect(statusEnviados).toHaveLength(0);

    const abaPat = {
      ...abaCas,
      id: 92,
      active: false,
      url: 'https://atendimento.inss.gov.br/requerimentos',
    };
    abas = [abaCas, abaPat];
    for (const listener of listenersAbas) {
      listener(abaPat.id, { status: 'complete', url: abaPat.url }, abaPat);
    }

    // Antes de preencher, o robô abre a consulta do GERID para ver se este CPF
    // já tem requerimento. Isso custa alguns segundos de carga de aba por caso —
    // barato perto de um segundo pedido no nome da mesma pessoa.
    const limiteResultado = Date.now() + 15_000;
    while (statusEnviados.length === 0 && Date.now() < limiteResultado) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(statusEnviados).toHaveLength(1);
    expect(heartbeats.some((item) => item.estadoGerid === 'autenticado')).toBe(true);
    expect(storage.execucaoAtivaGerid).toMatchObject({
      idExecucao: 'execucao-auth',
      geridTabId: 92,
      aguardandoConfirmacao: true,
    });
  }, 30_000);

  it('captura o protocolo apos a confirmacao humana e encerra a espera', async () => {
    const statusEnviados: any[] = [];
    const storage: Record<string, any> = {
      apiUrl: 'https://rpa.teste',
      apiToken: 'segredo',
      modoTeste: true,
      execucaoAtivaGerid: {
        idExecucao: 'execucao-confirmacao',
        geridTabId: 44,
        modoTeste: true,
        cpfAtual: '12345678901',
        nomeAtual: 'Pessoa de Teste',
        aguardandoConfirmacao: true,
      },
    };
    let chamadasDeteccao = 0;

    const chrome = {
      runtime: {
        onMessage: { addListener: () => undefined },
        onStartup: { addListener: () => undefined },
        sendMessage: async () => undefined,
      },
      action: {
        setBadgeBackgroundColor: async () => undefined,
        setBadgeText: async () => undefined,
      },
      alarms: {
        create: () => undefined,
        onAlarm: { addListener: () => undefined },
      },
      storage: {
        local: {
          get: async (chaves: string[]) =>
            Object.fromEntries(chaves.filter((chave) => chave in storage).map((chave) => [chave, storage[chave]])),
          set: async (valores: Record<string, any>) => Object.assign(storage, valores),
          remove: async (chave: string) => { delete storage[chave]; },
        },
      },
      tabs: {
        query: async () => [{ id: 44, active: true, status: 'complete', url: 'https://atendimento.inss.gov.br/requerimentos' }],
        get: async () => ({ id: 44, active: true, status: 'complete', url: 'https://atendimento.inss.gov.br/requerimentos' }),
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          if (opcoes.files) return [{ result: true }];
          chamadasDeteccao++;
          return [{ result: chamadasDeteccao === 1 ? true : '2026.0001234567-8' }];
        },
      },
    };

    const fetch = async (url: string, opcoes: any = {}) => {
      if (url.endsWith('/api/ext/status')) {
        statusEnviados.push(JSON.parse(opcoes.body));
        return { ok: true, status: 200 };
      }
      if (url.endsWith('/api/ext/fila')) {
        return { ok: true, json: async () => ({ sucesso: true, idExecucao: null, casos: [] }) };
      }
      if (url.endsWith('/api/ext/heartbeat')) return { ok: true, status: 200 };
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

    const limite = Date.now() + 2_000;
    while (statusEnviados.length === 0 && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(statusEnviados).toHaveLength(1);
    expect(statusEnviados[0]).toMatchObject({
      idExecucao: 'execucao-confirmacao',
      cpf: '12345678901',
      status: 'sucesso',
      protocolo: '2026.0001234567-8',
    });
    expect(storage.execucaoAtivaGerid).toBeUndefined();
  });
});
