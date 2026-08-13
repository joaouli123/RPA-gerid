import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * O robô pergunta ao GERID se o CPF já tem requerimento ANTES de abrir o
 * formulário.
 *
 * A conferência que existia acontecia só depois do preenchimento: quando o
 * portal deixava passar, o resultado era um SEGUNDO pedido no nome de uma
 * pessoa real. Perguntar antes custa uma consulta e evita isso.
 *
 * "Em Análise" e "Exigência" barram. "Concluída" e "Cancelada" NÃO — pedir de
 * novo depois de um BPC negado é exatamente o trabalho do escritório, e travar
 * isso seria pior do que o duplicado que se está evitando.
 *
 * ⚠️ Todo CPF, nome e protocolo aqui é FICTÍCIO.
 */
describe('consulta ao GERID antes de protocolar', () => {
  it('nao preenche para quem ja tem BPC em analise, e preenche para os outros', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const statusEnviados: any[] = [];
    const casosExecutados: string[] = [];
    let terminou = false;

    const aba = {
      id: 31,
      active: true,
      status: 'complete',
      url: 'https://atendimento.inss.gov.br/requerimentos',
    };
    const abaTarefas = { id: 32, status: 'complete', url: 'https://atendimento.inss.gov.br/tarefas' };

    const linha = (extra: Record<string, string>) => ({
      protocolo: '', servico: 'Benefício Assistencial à Pessoa com Deficiência',
      nome: 'NOME FICTICIO', cpf: '', protocoladoEm: '02/02/2026',
      unidade: 'APS EXEMPLO', situacao: '', atualizadoEm: '02/02/2026', ...extra,
    });

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
            return [{ result: { status: 'sucesso', protocolo: `90000000${arg.cpf[0]}` } }];
          }

          // `buscaConfirmada: true` em todas: aqui a lista RESPONDEU. É o que
          // separa "esta pessoa não tem nada" de "a consulta não voltou" —
          // sem essa marca, lista vazia não autoriza preenchimento nenhum.
          //
          // JÁ TEM um BPC em análise: este não pode chegar ao formulário.
          if (arg === '11111111111') {
            return [{ result: { buscaConfirmada: true, linhas: [linha({
              protocolo: '700000001', cpf: '11111111111', situacao: 'Em Análise',
            })] } }];
          }
          // BPC anterior CONCLUÍDO — processo encerrado. Não barra: negar o
          // pedido novo aqui seria o robô decidindo não atender.
          if (arg === '22222222222') {
            return [{ result: { buscaConfirmada: true, linhas: [linha({
              protocolo: '700000002', cpf: '22222222222', situacao: 'Concluída',
            })] } }];
          }
          // Aposentadoria em análise. Outro serviço, outro pedido: não barra BPC.
          if (arg === '33333333333') {
            return [{ result: { buscaConfirmada: true, linhas: [linha({
              protocolo: '700000003', cpf: '33333333333', situacao: 'Em Análise',
              servico: 'Aposentadoria por Idade',
            })] } }];
          }
          // Nunca pediu nada.
          if (arg === '44444444444') return [{ result: { buscaConfirmada: true, linhas: [] } }];

          // Gerar comprovante: aqui o argumento é o PROTOCOLO.
          if (typeof arg === 'string') return [{ result: { pdfBase64: 'JVBERi0xLjQK', bytes: 9 } }];
          return [{ result: true }];
        },
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
            idExecucao: 'exec-consulta',
            casos: [
              caso('Um Ficticio', '11111111111'),
              caso('Dois Ficticio', '22222222222'),
              caso('Tres Ficticio', '33333333333'),
              caso('Quatro Ficticio', '44444444444'),
            ],
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

    const limite = Date.now() + 40_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(terminou, 'a fila nao encerrou dentro do tempo').toBe(true);

    // O de "Em Análise" NÃO chegou ao formulário. Os outros três chegaram.
    expect(casosExecutados).toEqual(['22222222222', '33333333333', '44444444444']);

    // E ele não virou erro: virou sucesso com o número que já existia, mais o
    // comprovante baixado na hora pela própria consulta.
    const barrado = statusEnviados.find((s) => s.cpf === '11111111111');
    expect(barrado).toMatchObject({ status: 'sucesso', protocolo: '700000001' });
    expect(barrado.motivoErro).toMatch(/JA ESTAVA protocolado/i);
    expect(barrado.pdfBase64).toBe('JVBERi0xLjQK');
    expect(barrado.pdfNome).toBe('comprovante 700000001.pdf');

    const logs = (storage.logsGerid ?? []).map((item: any) => item.mensagem).join('\n');
    expect(logs).toMatch(/Um Ficticio JA TEM requerimento no GERID/i);
    expect(logs).toMatch(/Dois Ficticio nao tem BPC em andamento/i);
  }, 60_000);
});
