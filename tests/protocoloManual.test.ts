import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Protocolo anotado à mão.
 *
 * O caso real que motivou isto: a extensão protocolou no GERID, caiu antes de
 * gravar o número, e o histórico ficou com o cliente marcado como "erro". Como a
 * trava anti-duplicidade lê o histórico, ela não sabia que já havia requerimento
 * aberto — e na rodada seguinte teria protocolado a mesma pessoa de novo.
 *
 * O que precisa valer depois de registrar à mão é exatamente o que valeria se o
 * robô tivesse gravado: a pessoa sai da fila.
 */
const PASTA_TMP = path.join(os.tmpdir(), `rpa-gerid-manual-${process.pid}`);
process.env.RPA_ESTADO_ARQUIVO = path.join(PASTA_TMP, 'estado.json');

const store = await import('@/lib/server/store');

// CPF e protocolo FICTÍCIOS — dado real de requerente não entra em teste.
const CPF = '111.444.777-35';
const NOME = 'CLIENTE DE TESTE';
const PROTOCOLO = '9999999999';

beforeAll(async () => {
  await fs.mkdir(PASTA_TMP, { recursive: true });
});

afterAll(async () => {
  await fs.rm(PASTA_TMP, { recursive: true, force: true });
});

describe('registrar protocolo que o GERID já devolveu', () => {
  it('passa a valer para a trava anti-duplicidade', async () => {
    expect(await store.protocoloDoCpf(CPF)).toBeNull();

    await store.registrarProtocoloManual(CPF, NOME, PROTOCOLO);

    // Achável pelo CPF com máscara ou sem: a tela manda um, a planilha manda outro.
    const registro = await store.protocoloDoCpf(CPF);
    expect(registro?.protocolo).toBe(PROTOCOLO);
    expect((await store.protocolosPorCpf()).get('11144477735')?.protocolo).toBe(PROTOCOLO);
  });

  it('recusa sobrescrever um número já gravado', async () => {
    // Trocar protocolo existente perde o rastro do requerimento verdadeiro: o
    // número antigo some do histórico e ninguém mais acha o pedido no INSS.
    await expect(store.registrarProtocoloManual(CPF, NOME, '1234567890')).rejects.toThrow(
      /já tem o protocolo/i,
    );
    expect((await store.protocoloDoCpf(CPF))?.protocolo).toBe(PROTOCOLO);
  });

  it('exige um número — salvar vazio marcaria o cliente como resolvido sem requerimento', async () => {
    await expect(store.registrarProtocoloManual('222.333.444-05', NOME, '  ')).rejects.toThrow(
      /número do protocolo/i,
    );
  });

  it('aceita o número digitado com pontuação, guardando só os dígitos', async () => {
    await store.registrarProtocoloManual('333.444.555-06', NOME, '155.565-9503');
    expect((await store.protocoloDoCpf('333.444.555-06'))?.protocolo).toBe('1555659503');
  });
});
