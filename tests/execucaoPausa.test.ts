import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Pausa da fila e comprovante servido pelo painel.
 *
 * O prazo de expiração fica curto de propósito (200 ms): é o único jeito de
 * provar, em teste, que uma fila PAUSADA não é confundida com uma fila
 * abandonada. Sem a guarda, uma pausa para o almoço mataria a execução e todo
 * caso que ainda não rodou viraria "erro" sozinho.
 */
const PASTA_TMP = path.join(os.tmpdir(), `rpa-gerid-pausa-${process.pid}`);
process.env.RPA_ESTADO_ARQUIVO = path.join(PASTA_TMP, 'estado.json');
process.env.RPA_TEMPO_LIMITE_EXECUCAO_MS = '200';

const store = await import('@/lib/server/store');

beforeAll(async () => {
  await fs.mkdir(PASTA_TMP, { recursive: true });
});

afterAll(async () => {
  await fs.rm(PASTA_TMP, { recursive: true, force: true });
});

async function esperar(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('pausa da fila', () => {
  it('pausa não expira a execução, e retomar volta a contar o prazo', async () => {
    const inicial = await store.iniciarExecucao();
    await store.definirPausaExecucao(true);

    expect(await store.execucaoPausada(inicial.id)).toBe(true);

    // Muito além do prazo de 200 ms: pausada, a execução tem de continuar viva
    // e os casos continuam esperando.
    await esperar(900);
    const pausada = await store.getExecucaoAtual();
    expect(pausada?.status).toBe('rodando');
    expect(pausada?.pausadaEm).toBeTruthy();
    expect(pausada?.casos.every((c) => c.status === 'pendente')).toBe(true);

    await store.definirPausaExecucao(false);
    const retomada = await store.getExecucaoAtual();
    expect(retomada?.pausadaEm).toBeUndefined();
    expect(await store.execucaoPausada(inicial.id)).toBe(false);

    // Retomada e sem sinal da extensão, aí sim expira — a guarda não pode ter
    // desligado o expirador para sempre.
    const limite = Date.now() + 10_000;
    let atual = await store.getExecucaoAtual();
    while (atual?.status === 'rodando' && Date.now() < limite) {
      await esperar(100);
      atual = await store.getExecucaoAtual();
    }
    expect(atual?.status).not.toBe('rodando');
  }, 30_000);

  it('não deixa pausar quando não há execução aberta', async () => {
    await store.limparExecucaoAtual();
    await expect(store.definirPausaExecucao(true)).rejects.toThrow(/execucao aberta/i);
  });
});

describe('comprovante no painel', () => {
  it('guarda o PDF e devolve pelo par execução+CPF', async () => {
    const execucao = await store.iniciarExecucao();
    const caso = execucao.casos[0];
    if (!caso) throw new Error('O dataset de teste precisa de ao menos um caso.');

    const pdf = Buffer.from('%PDF-1.4 comprovante de teste');
    const registro = await store.anexarComprovanteAoCaso(
      execucao.id,
      caso.cpf,
      pdf,
      'comprovante 1234567890.pdf',
      { destino: 'local', referencia: 'saida/000/comprovante.pdf' },
    );

    expect(registro).toMatchObject({
      nome: 'comprovante 1234567890.pdf',
      tamanhoBytes: pdf.byteLength,
      destino: 'local',
    });

    const lido = await store.lerComprovanteDoCaso(execucao.id, caso.cpf);
    expect(lido?.bytes.equals(pdf)).toBe(true);
    expect(lido?.nome).toBe('comprovante 1234567890.pdf');

    // O caso carrega o registro — é o que faz o link aparecer na tela.
    const atual = await store.getExecucaoAtual();
    expect(atual?.casos.find((c) => c.cpf === caso.cpf)?.comprovante?.nome).toBe(
      'comprovante 1234567890.pdf',
    );

    // Caso sem comprovante registrado não devolve arquivo nenhum, mesmo que o
    // parâmetro pareça válido.
    expect(await store.lerComprovanteDoCaso(execucao.id, '00000000000')).toBeNull();

    await store.finalizarExecucao(execucao.id);
    // Depois de arquivada, o histórico ainda serve o mesmo PDF.
    const doHistorico = await store.lerComprovanteDoCaso(execucao.id, caso.cpf);
    expect(doHistorico?.bytes.equals(pdf)).toBe(true);
  }, 30_000);

  it('recusa parâmetro que tenta escapar da pasta de comprovantes', async () => {
    const execucao = await store.getExecucaoAtual();
    // Sem execução aberta o caminho nem chega a ser montado; o que importa é
    // que travessia de diretório nunca vire leitura de arquivo do servidor.
    expect(execucao?.pausadaEm).toBeUndefined();
    expect(await store.lerComprovanteDoCaso('../../etc', '../../etc/passwd')).toBeNull();
  });
});
