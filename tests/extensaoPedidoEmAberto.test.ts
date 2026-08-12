import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * O GERID recusando o serviço porque JÁ EXISTE pedido aberto para o CPF.
 *
 * A frase dele é: "Não é possível continuar com este serviço: O pedido
 * 1555659503 ainda está em aberto." Isso não é falha — é o portal dizendo que o
 * caso JÁ FOI protocolado. Tratar como erro faria o robô tentar de novo na
 * rodada seguinte, e cada tentativa é um requerimento a mais no nome de uma
 * pessoa real.
 *
 * O cenário aqui é o pior: o robô NÃO leu o número na tela (o aviso sumiu antes)
 * e o protocolo é de OUTRO DIA, então a busca "linha de hoje" não acha nada. O
 * único vestígio é a frase dentro da mensagem de erro.
 */
describe('extensao Gerid - pedido ja em aberto', () => {
  it('le o numero na recusa, busca o comprovante e segue para o proximo caso', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const statusEnviados: any[] = [];
    const casosExecutados: string[] = [];
    let terminou = false;

    const aba = {
      id: 21,
      active: true,
      status: 'complete',
      url: 'https://atendimento.inss.gov.br/requerimentos',
    };
    const abaTarefas = { id: 22, status: 'complete', url: 'https://atendimento.inss.gov.br/tarefas' };
    const abasFechadas: number[] = [];

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
        remove: async (id: number) => { abasFechadas.push(id); },
        onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      },
      scripting: {
        executeScript: async (opcoes: any) => {
          const arg = opcoes.args?.[0];

          // O caso indo para o GERID: o robô estoura sem número na mão, e o
          // ÚNICO vestígio do protocolo é a frase da recusa.
          if (arg && typeof arg === 'object' && arg.cpf) {
            casosExecutados.push(arg.cpf);
            if (arg.cpf === '11111111111') {
              return [{
                result: {
                  status: 'erro',
                  erro: 'O GERID bloqueou este requerente: o pedido 1555659503 ainda esta em aberto. '
                    + 'Nao refiz o requerimento.',
                },
              }];
            }
            return [{ result: { status: 'sucesso', protocolo: '1999888777' } }];
          }

          // Lista de tarefas filtrada por CPF. A data é de OUTRO dia de
          // propósito: o caso foi protocolado antes, e a busca por "linha de
          // hoje" não pode ser o que salva este cenário.
          if (arg === '11111111111') {
            return [{
              result: {
                linhas: [{
                  protocolo: '1555659503',
                  servico: 'Beneficio Assistencial a Pessoa com Deficiencia',
                  nome: 'PRIMEIRA PESSOA',
                  cpf: '11111111111',
                  protocoladoEm: '01/01/2020',
                  unidade: 'APS EXTREMOZ',
                  situacao: 'Em Analise',
                  atualizadoEm: '01/01/2020',
                }],
              },
            }];
          }
          if (arg === '22222222222') {
            return [{
              result: {
                linhas: [{
                  protocolo: '1999888777',
                  servico: 'Beneficio Assistencial a Pessoa com Deficiencia',
                  nome: 'SEGUNDA PESSOA',
                  cpf: '22222222222',
                  protocoladoEm: '12/08/2026',
                  unidade: 'APS EXTREMOZ',
                  situacao: 'Em Analise',
                  atualizadoEm: '12/08/2026',
                }],
              },
            }];
          }
          // Chamada de gerar comprovante: o argumento aqui é o PROTOCOLO.
          if (arg === '1555659503' || arg === '1999888777') {
            return [{ result: { pdfBase64: 'JVBERi0xLjQK', bytes: 9 } }];
          }
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
            idExecucao: 'exec-aberto',
            casos: [caso('Primeira Pessoa', '11111111111'), caso('Segunda Pessoa', '22222222222')],
          }),
        };
      }
      if (url.endsWith('/api/ext/heartbeat')) {
        return { ok: true, status: 200, json: async () => ({ sucesso: true }) };
      }
      if (url.endsWith('/api/ext/status')) {
        const corpo = JSON.parse(opcoes.body);
        statusEnviados.push(corpo);
        // O segundo caso salva só no painel de propósito: é o que acontece de
        // verdade quando a service account não tem cota para criar no Drive. O
        // robô não pode chamar isso de "confirmado".
        const meioCaminho = corpo.cpf === '22222222222';
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            sucesso: true,
            comprovante: meioCaminho
              ? { painel: true, drive: false, aviso: 'Sem cota para criar arquivo no Drive.' }
              : { painel: true, drive: true, aviso: '' },
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
      setTimeout,
      clearTimeout,
      Date,
      Promise,
    });

    for (const listener of listeners) {
      listener({ action: 'start', apiUrl: 'https://rpa.teste', apiToken: 'segredo', modoTeste: false });
    }

    const limite = Date.now() + 15_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(terminou, 'a fila nao encerrou dentro do tempo').toBe(true);

    // 1) A recusa virou SUCESSO com o número que o próprio GERID citou.
    const primeiro = statusEnviados.find((s) => s.cpf === '11111111111');
    expect(primeiro).toMatchObject({ status: 'sucesso', protocolo: '1555659503' });
    expect(primeiro.motivoErro).toMatch(/JA ESTAVA protocolado/i);

    // 2) Foi buscar o comprovante desse protocolo, mesmo sendo de outro dia.
    expect(primeiro.pdfBase64).toBe('JVBERi0xLjQK');
    expect(primeiro.pdfNome).toBe('comprovante 1555659503.pdf');

    // 3) E seguiu para o próximo caso em vez de parar a fila.
    expect(casosExecutados).toEqual(['11111111111', '22222222222']);
    expect(statusEnviados.find((s) => s.cpf === '22222222222')).toMatchObject({ status: 'sucesso' });

    // A aba da lista de tarefas não fica aberta atrás do operador.
    expect(abasFechadas).toContain(abaTarefas.id);

    const logs = (storage.logsGerid ?? []).map((item: any) => item.mensagem).join('\n');
    expect(logs).toMatch(/Primeira Pessoa confirmado no painel E no Drive do cliente/i);

    // E o oposto: salvar só no painel NÃO pode virar "confirmado". Sem isto o
    // operador fecha o caso achando que o comprovante está na pasta do cliente.
    expect(logs).toMatch(
      /ATENCAO: o comprovante de Segunda Pessoa entrou no painel mas NAO no Drive do cliente/i,
    );
  }, 40_000);
});
