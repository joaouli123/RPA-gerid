import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O comprovante que o WhatsApp derrubou não pode se perder.
 *
 * Este é o modo de falha mais caro do sistema porque não parece falha: o
 * protocolo saiu, o painel mostra "PROTOCOLADO", o caso está marcado como
 * sucesso — e por isso mesmo NADA reprocessa aquele cliente. Antes desta fila,
 * uma queda de conexão de dez segundos apagava a entrega para sempre, e a
 * primeira pessoa a notar seria alguém dando falta do PDF semanas depois.
 *
 * Aconteceu de verdade em 13/08/2026: dois comprovantes, "Connection Closed",
 * nenhum reenvio.
 */

const enviar = vi.fn();
vi.mock('../lib/server/whatsapp', () => ({
  enviarComprovanteAoOperador: (opcoes: unknown) => enviar(opcoes),
}));

const ocorrencias: Array<Record<string, unknown>> = [];
vi.mock('../lib/server/diagnostico', () => ({
  registrarOcorrencia: async (o: Record<string, unknown>) => { ocorrencias.push(o); },
}));

let pasta = '';

async function carregar() {
  process.env.RPA_WHATSAPP_PENDENTES = pasta;
  vi.resetModules();
  return import('../lib/server/whatsappPendentes');
}

const CASO = {
  nome: 'Pessoa Ficticia',
  cpf: '11111111111',
  protocolo: '1941397434',
  pdf: Buffer.from('%PDF-1.4 conteudo ficticio'),
  nomeArquivo: 'Pessoa Ficticia - comprovante 1941397434.pdf',
};

beforeEach(async () => {
  pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'rpa-pendentes-'));
  enviar.mockReset();
  ocorrencias.length = 0;
});

afterEach(async () => {
  await fs.rm(pasta, { recursive: true, force: true });
  delete process.env.RPA_WHATSAPP_PENDENTES;
});

describe('whatsapp - comprovantes pendentes', () => {
  it('guarda o PDF inteiro, para a divida nao depender de outro arquivo', async () => {
    const fila = await carregar();
    await fila.guardarComprovantePendente({ ...CASO, erro: 'Connection Closed' });

    expect(await fila.contarPendentes()).toBe(1);

    // O PDF vai junto de proposito: a hora em que esta fila mais importa e
    // justamente aquela em que o arquivamento tambem falhou. Uma referencia
    // para o arquivo do painel seria uma divida impossivel de pagar.
    enviar.mockResolvedValue({ ok: true });
    expect(await fila.reenviarPendentes()).toBe(1);
    const recebido = enviar.mock.calls[0]?.[0] as { pdf: Buffer; nome: string };
    expect(Buffer.from(recebido.pdf).toString()).toBe(CASO.pdf.toString());
    expect(recebido.nome).toBe('Pessoa Ficticia');
  });

  it('entregou: a divida some e nao e cobrada duas vezes', async () => {
    const fila = await carregar();
    await fila.guardarComprovantePendente(CASO);

    enviar.mockResolvedValue({ ok: true });
    expect(await fila.reenviarPendentes()).toBe(1);
    expect(await fila.contarPendentes()).toBe(0);

    // O operador nao pode receber o mesmo comprovante em toda ronda.
    expect(await fila.reenviarPendentes()).toBe(0);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('WhatsApp ainda fora do ar: a divida fica e volta na proxima ronda', async () => {
    const fila = await carregar();
    await fila.guardarComprovantePendente(CASO);

    enviar.mockResolvedValue({ ok: false, erro: 'Connection Closed' });
    expect(await fila.reenviarPendentes()).toBe(0);
    expect(await fila.contarPendentes()).toBe(1);

    // Voltou o sinal: a proxima volta entrega, sem ninguem clicar em nada.
    enviar.mockResolvedValue({ ok: true });
    expect(await fila.reenviarPendentes()).toBe(1);
    expect(await fila.contarPendentes()).toBe(0);
  });

  it('desistir e permitido; desistir calado nao', async () => {
    const fila = await carregar();
    await fila.guardarComprovantePendente(CASO);
    enviar.mockResolvedValue({ ok: false, erro: 'Connection Closed' });

    // 20 tentativas cobrem mais de uma hora e meia de ronda. Passou disso nao e
    // oscilacao de rede, e insistir para sempre esconderia um problema real.
    for (let i = 0; i < 20; i++) await fila.reenviarPendentes();

    expect(await fila.contarPendentes()).toBe(0);
    const registrada = ocorrencias.find((o) => o.etapa === 'whatsapp');
    expect(registrada, 'desistiu sem registrar nada no Diagnostico').toBeTruthy();
    expect(String(registrada?.mensagem)).toContain('1941397434');
    expect(registrada?.cpf).toBe('11111111111');
  });

  it('sem pasta nenhuma, o dia normal nao e erro', async () => {
    await fs.rm(pasta, { recursive: true, force: true });
    const fila = await carregar();

    expect(await fila.contarPendentes()).toBe(0);
    expect(await fila.reenviarPendentes()).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });
});
