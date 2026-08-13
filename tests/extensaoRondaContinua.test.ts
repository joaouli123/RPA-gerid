import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * A ronda é o que torna o robô um processo contínuo em vez de uma ferramenta
 * que alguém aciona. O navegador fica aberto o dia inteiro e ela olha, de cinco
 * em cinco minutos, se apareceu pasta nova no Drive.
 *
 * O risco dela não é deixar de rodar — é rodar demais e mal. Num dia comum ela
 * dispara mais de cem vezes e na maioria delas a resposta certa é "não há nada
 * para fazer". Se isso for tratado como erro, o robô queima as tentativas de
 * retomada, enche o log de alarme falso e empurra para fora do histórico as
 * linhas do protocolo que deu certo de manhã.
 */

const CODIGO = await readFile(
  path.join(process.cwd(), 'extensao-gerid', 'background.js'),
  'utf8',
);

interface Cenario {
  logs: string[];
  alarmes: Array<{ nome: string; opcoes: any }>;
  dispararRonda: () => Promise<void>;
  casosExecutados: string[];
  postsIniciar: number;
}

/**
 * Monta um background.js isolado e devolve o controle da ronda.
 *
 * `haTrabalho` é o que o SERVIDOR responderia a `/api/ext/iniciar`: false é o
 * 422 de "não há nada para protocolar", true é a fila aberta com pasta nova.
 */
function montar(filaPorChamada: () => any, haTrabalho: () => boolean = () => false): Cenario {
  const logs: string[] = [];
  const alarmes: Array<{ nome: string; opcoes: any }> = [];
  const casosExecutados: string[] = [];
  const storage: Record<string, any> = {
    apiUrl: 'https://rpa.teste',
    apiToken: 'segredo',
    modoTeste: false,
  };
  let ouvinteAlarme: ((a: { name: string }) => void) | null = null;
  let terminou = false;
  let postsIniciar = 0;

  const aba = {
    id: 77,
    active: true,
    status: 'complete',
    url: 'https://atendimento.inss.gov.br/requerimentos',
  };
  let etapaAtual = 'lista_requerimentos';

  const chrome = {
    runtime: {
      onMessage: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      onInstalled: { addListener: () => undefined },
      sendMessage: async (mensagem: any) => {
        if (mensagem?.action === 'log') logs.push(String(mensagem.message));
        if (mensagem?.action === 'finished') terminou = true;
        return undefined;
      },
    },
    action: { setBadgeBackgroundColor: async () => undefined, setBadgeText: async () => undefined },
    notifications: { create: async () => undefined },
    alarms: {
      create: (nome: string, opcoes: any) => alarmes.push({ nome, opcoes }),
      onAlarm: { addListener: (fn: any) => { ouvinteAlarme = fn; } },
    },
    storage: {
      local: {
        get: async (chaves: string[]) => Object.fromEntries(
          chaves.filter((c) => c in storage).map((c) => [c, storage[c]]),
        ),
        set: async (valores: Record<string, any>) => Object.assign(storage, valores),
        remove: async (chave: string) => { delete storage[chave]; },
      },
    },
    tabs: {
      query: async () => [aba],
      get: async () => aba,
      create: async () => aba,
      remove: async () => undefined,
      update: async () => aba,
      reload: async () => undefined,
      onUpdated: { addListener: () => undefined, removeListener: () => undefined },
    },
    scripting: {
      executeScript: async (opcoes: any) => {
        const arg = opcoes.args?.[0];
        if (arg && typeof arg === 'object' && arg.cpf) {
          casosExecutados.push(arg.cpf);
          etapaAtual = 'comprovante';
          return [{ result: { status: 'sucesso', protocolo: '1941397434' } }];
        }
        if (typeof arg === 'string' && /^\d{11}$/.test(arg)) return [{ result: { linhas: [] } }];
        if (typeof arg === 'string' && /^\d{10}$/.test(arg)) {
          return [{ result: { pdfBase64: 'JVBERi0xLjQK', bytes: 9 } }];
        }
        const fonte = String(opcoes.func || '');
        if (fonte.includes('obterEstadoGerid')) {
          return [{ result: fonte.includes('etapa') ? etapaAtual : { etapa: etapaAtual, modal: null } }];
        }
        if (fonte.includes('reiniciar') || opcoes.files) {
          etapaAtual = 'lista_requerimentos';
          return [{ result: true }];
        }
        return [{ result: true }];
      },
    },
  };

  const fetch = async (url: string, opcoes: any = {}) => {
    if (url.endsWith('/api/ext/fila')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(filaPorChamada()) };
    }
    if (url.endsWith('/api/ext/iniciar')) {
      postsIniciar++;
      if (haTrabalho()) {
        return {
          ok: true,
          status: 202,
          text: async () => JSON.stringify({ sucesso: true, idExecucao: 'exec-ronda', total: 1 }),
        };
      }
      // O servidor recusa com 422 quando não há o que protocolar. Este é o dia
      // normal do escritório, e é justamente o que a ronda não pode confundir
      // com defeito.
      return {
        ok: false,
        status: 422,
        text: async () => JSON.stringify({
          sucesso: false,
          codigo: 'sem_trabalho',
          erro: 'Nada a protocolar: os 3 cliente(s) prontos já têm protocolo.',
        }),
      };
    }
    if (url.endsWith('/api/ext/heartbeat') || url.endsWith('/api/ext/erro')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ sucesso: true }) };
    }
    if (url.endsWith('/api/ext/status')) {
      JSON.parse(opcoes.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          sucesso: true,
          comprovante: { painel: true, drive: true, whatsapp: true, aviso: '' },
        }),
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  vm.runInNewContext(CODIGO, {
    chrome,
    fetch,
    AbortController,
    Uint8Array,
    btoa: (v: string) => Buffer.from(v, 'binary').toString('base64'),
    console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    URL,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
  });

  async function dispararRonda() {
    terminou = false;
    ouvinteAlarme?.({ name: 'rondaContinuaGerid' });
    // `processQueue` sempre avisa `finished` no `finally`, inclusive quando sai
    // cedo por não haver trabalho — então dá para esperar o fim de verdade em
    // vez de chutar um tempo, que era o que fazia a volta com trabalho ser
    // medida antes de terminar.
    const limite = Date.now() + 20_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  return {
    logs,
    alarmes,
    dispararRonda,
    casosExecutados,
    get postsIniciar() { return postsIniciar; },
  } as Cenario;
}

describe('extensao Gerid - ronda continua', () => {
  it('arma um alarme periodico assim que o service worker acorda', () => {
    const cenario = montar(() => ({ sucesso: true, idExecucao: null, casos: [] }));
    const ronda = cenario.alarmes.find((a) => a.nome === 'rondaContinuaGerid');

    // Sem isto o robô só trabalha quando alguém clica — que é exatamente o que
    // a ronda existe para acabar.
    expect(ronda, 'a ronda nao foi armada no arranque').toBeTruthy();
    expect(ronda?.opcoes?.periodInMinutes).toBe(5);
  });

  it('dia sem pasta nova: espera em silencio, sem tratar isso como erro', async () => {
    const cenario = montar(() => ({ sucesso: true, idExecucao: null, casos: [] }));

    await cenario.dispararRonda();
    await cenario.dispararRonda();
    await cenario.dispararRonda();

    // Conferiu de verdade nas três voltas — não é silêncio por ter desistido.
    expect(cenario.postsIniciar).toBe(3);

    // "Não há nada para protocolar" não é falha. Se virasse erro fatal, cada
    // volta gastaria uma tentativa de retomada e o robô se declararia quebrado
    // num dia em que apenas não havia trabalho.
    expect(cenario.logs.filter((l) => /Erro fatal/i.test(l))).toEqual([]);

    // E é dito UMA vez, não uma por volta: são mais de cem voltas por dia, e o
    // histórico da extensão só guarda 80 linhas.
    const avisos = cenario.logs.filter((l) => /Nada a protocolar/i.test(l));
    expect(avisos, `a ronda repetiu o aviso: ${JSON.stringify(cenario.logs)}`).toHaveLength(1);
  }, 30_000);

  it('quando aparece cliente novo, protocola sem ninguem clicar', async () => {
    let chamadas = 0;
    const cenario = montar(() => {
      chamadas++;
      // A primeira consulta ainda não conhece a pasta nova; é o `iniciar` que
      // manda reler o Drive, e só a consulta seguinte enxerga o cliente.
      if (chamadas <= 1) return { sucesso: true, idExecucao: null, casos: [] };
      return {
        sucesso: true,
        idExecucao: 'exec-ronda',
        casos: [{
          nome: 'Pessoa Ficticia',
          cpf: '11111111111',
          dados: { cliente: { cpf: '11111111111' }, grupoFamiliar: { integrantes: [] } },
          configuracao: { procuradorCpf: '00000000000', telefonePadrao: '', emailEscritorio: '' },
          anexos: [],
        }],
      };
    }, () => true);

    await cenario.dispararRonda();

    expect(cenario.casosExecutados).toEqual(['11111111111']);
    expect(cenario.logs.some((l) => /PROTOCOLADO/.test(l))).toBe(true);
  }, 40_000);
});
