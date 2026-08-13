import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Depois de protocolar de verdade, a aba fica no DETALHE da tarefa concluída —
 * a tela com "Gerar Comprovante", "Cancelar Requerimento" e "Voltar". Dali o
 * próximo cliente não começa.
 *
 * Foi o que aconteceu no primeiro protocolo real: o robô preencheu, protocolou,
 * capturou o comprovante, salvou tudo — e estacionou nessa tela, de pedido
 * feito, parecendo travado. O sucesso mandava `continue` sem tocar na aba,
 * apostando que a tela do comprovante servia de ponto de partida. Não serve.
 */
describe('extensao Gerid - tela depois do protocolo', () => {
  it('devolve a aba ao inicio antes de chamar o proximo cliente', async () => {
    const listeners: Array<(mensagem: any) => void> = [];
    const storage: Record<string, any> = {};
    const casosExecutados: string[] = [];
    /** Toda etapa em que a aba esteve quando alguém pediu para prepará-la. */
    const reinicios: string[] = [];
    let terminou = false;
    // A tela em que a aba está. Protocolar leva ao comprovante; é de lá que o
    // robô precisa sair sozinho.
    let etapaAtual = 'lista_requerimentos';

    const aba = {
      id: 31,
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

          // O caso indo para o GERID: protocola e a tela vira o comprovante.
          if (arg && typeof arg === 'object' && arg.cpf) {
            casosExecutados.push(arg.cpf);
            etapaAtual = 'comprovante';
            return [{ result: { status: 'sucesso', protocolo: `19413974${casosExecutados.length}` } }];
          }

          // Consulta da lista por CPF: ninguém tem pedido em aberto.
          if (typeof arg === 'string' && /^\d{11}$/.test(arg)) return [{ result: { linhas: [] } }];

          // Captura do comprovante (o argumento é o protocolo).
          if (typeof arg === 'string' && /^\d{10}$/.test(arg)) {
            return [{ result: { pdfBase64: 'JVBERi0xLjQK', bytes: 9 } }];
          }

          // Sem args: as chamadas de infraestrutura. A que lê a etapa da tela é
          // a que este teste observa; as outras respondem `true` e saem.
          const fonte = String(opcoes.func || '');
          if (fonte.includes('obterEstadoGerid')) {
            return [{ result: fonte.includes('etapa') ? etapaAtual : { etapa: etapaAtual, modal: null } }];
          }
          if (fonte.includes('reiniciar') || opcoes.files) {
            reinicios.push(etapaAtual);
            etapaAtual = 'lista_requerimentos';
            return [{ result: true }];
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
            idExecucao: 'exec-tela',
            casos: [caso('Primeira Pessoa', '11111111111'), caso('Segunda Pessoa', '22222222222')],
          }),
        };
      }
      if (url.endsWith('/api/ext/heartbeat')) {
        return { ok: true, status: 200, json: async () => ({ sucesso: true }) };
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

    const limite = Date.now() + 15_000;
    while (!terminou && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(terminou, 'a fila nao encerrou dentro do tempo').toBe(true);

    // O segundo cliente só é alcançável se a tela do primeiro tiver sido
    // deixada para trás. Sem isso a fila para no comprovante do primeiro.
    expect(casosExecutados).toEqual(['11111111111', '22222222222']);

    // E foi a tela do COMPROVANTE que o robô teve de abandonar — não uma
    // qualquer. É essa a que ele se recusava a deixar.
    expect(reinicios, 'ninguem tirou a aba da tela de comprovante').toContain('comprovante');

    // A tela não fica com o recibo do último cliente na frente do operador.
    expect(etapaAtual).toBe('lista_requerimentos');
  }, 40_000);
});
