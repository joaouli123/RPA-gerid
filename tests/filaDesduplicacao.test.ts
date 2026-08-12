import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Desduplicação da fila: quem já tem protocolo NÃO é protocolado de novo.
 *
 * Esta é a trava mais cara do sistema de errar. A pasta do cliente continua no
 * Drive depois do protocolo, então toda leitura devolve a mesma pessoa outra
 * vez; sem esta regra a fila reprotocolaria o mesmo BPC todo dia, e cada
 * repetição é um requerimento a mais aberto no INSS em nome de uma pessoa com
 * deficiência — que depois alguém tem que cancelar na mão.
 *
 * A chave é o NÚMERO do protocolo, nunca o status: status é escrito pelo nosso
 * código e pode estar errado; o número só existe porque o GERID devolveu.
 */
const PASTA_TMP = path.join(os.tmpdir(), `rpa-gerid-dedup-${process.pid}`);
process.env.RPA_ESTADO_ARQUIVO = path.join(PASTA_TMP, 'estado.json');

const store = await import('@/lib/server/store');

beforeAll(async () => {
  await fs.mkdir(PASTA_TMP, { recursive: true });
});

afterAll(async () => {
  await fs.rm(PASTA_TMP, { recursive: true, force: true });
});

/** Fecha a execução aberta e limpa, para a próxima começar do zero. */
async function encerrarRodada(id: string): Promise<void> {
  await store.finalizarExecucao(id);
  await store.limparExecucaoAtual();
}

describe('fila não reprotocola quem já tem protocolo', () => {
  it('cliente protocolado volta só para buscar o comprovante, nunca para refazer', async () => {
    const primeira = await store.iniciarExecucao();
    const alvo = primeira.casos[0];
    expect(alvo).toBeDefined();
    if (!alvo) return;

    // O GERID devolveu o número: a partir daqui o requerimento EXISTE.
    await store.atualizarStatusCaso(primeira.id, alvo.cpf, 'sucesso', undefined, '1555659503');
    await encerrarRodada(primeira.id);

    const registrados = await store.protocolosPorCpf();
    expect(registrados.size).toBe(1);

    const segunda = await store.iniciarExecucao();
    const voltou = segunda.casos.find((c) => c.cpf === alvo.cpf);

    // Voltou — mas em modo só-comprovante, com o número já conhecido. O que
    // NÃO pode acontecer é voltar como caso novo, sem protocolo: aí a extensão
    // abriria o formulário e criaria o segundo pedido.
    expect(voltou).toBeDefined();
    expect(voltou?.somenteComprovante).toBe(true);
    expect(voltou?.protocolo).toBe('1555659503');
    await encerrarRodada(segunda.id);
  });

  it('falhar ao baixar o comprovante NÃO apaga o protocolo já emitido', async () => {
    const rodada = await store.iniciarExecucao();
    const alvo = rodada.casos.find((c) => c.somenteComprovante);
    expect(alvo).toBeDefined();
    if (!alvo) return;

    // A lista do GERID não devolveu o PDF. Isso é falta de arquivo, não falta
    // de requerimento — apagar o número aqui liberaria um reprotocolo amanhã.
    await store.atualizarStatusCaso(rodada.id, alvo.cpf, 'erro', 'Comprovante nao capturado.');

    const depois = await store.getExecucaoAtual();
    const caso = depois?.casos.find((c) => c.cpf === alvo.cpf);
    expect(caso?.status).toBe('erro');
    expect(caso?.protocolo).toBe('1555659503');

    await encerrarRodada(rodada.id);
    expect((await store.protocolosPorCpf()).get(caso!.cpf.replace(/\D/g, ''))?.protocolo)
      .toBe('1555659503');
  });

  it('com o comprovante arquivado, o cliente sai da fila de vez', async () => {
    const rodada = await store.iniciarExecucao();
    const alvo = rodada.casos.find((c) => c.somenteComprovante);
    expect(alvo).toBeDefined();
    if (!alvo) return;

    await store.atualizarStatusCaso(rodada.id, alvo.cpf, 'sucesso', undefined, '1555659503');
    await store.anexarComprovanteAoCaso(
      rodada.id,
      alvo.cpf,
      new Uint8Array([1, 2, 3]),
      'comprovante 1555659503.pdf',
      { destino: 'local', referencia: 'saida/teste.pdf' },
    );
    await encerrarRodada(rodada.id);

    const seguinte = await store.iniciarExecucao();
    expect(seguinte.casos.some((c) => c.cpf === alvo.cpf)).toBe(false);
    // Não some calado: fica listado como pulado, com o número, para o operador
    // ver que a pessoa foi considerada e por que ficou de fora.
    expect(seguinte.pulados?.some((p) => p.protocolo === '1555659503')).toBe(true);
    await encerrarRodada(seguinte.id);
  });

  it('sem nenhum caso novo, o erro diz "já têm protocolo" em vez de mandar corrigir pendência', async () => {
    // Protocola TODO mundo que sobrou, com comprovante, e tenta de novo.
    const rodada = await store.iniciarExecucao();
    for (const [i, caso] of rodada.casos.entries()) {
      const numero = `20000000${i}`;
      await store.atualizarStatusCaso(rodada.id, caso.cpf, 'sucesso', undefined, numero);
      await store.anexarComprovanteAoCaso(
        rodada.id,
        caso.cpf,
        new Uint8Array([9]),
        `comprovante ${numero}.pdf`,
        { destino: 'local', referencia: `saida/${numero}.pdf` },
      );
    }
    await encerrarRodada(rodada.id);

    await expect(store.iniciarExecucao()).rejects.toThrow(/já têm protocolo/);
  });
});

describe('extensão: modo só-comprovante não encosta no formulário', () => {
  it('sai do laço ANTES de baixar anexos e de executar o caso no GERID', async () => {
    const fonte = await fs.readFile(
      path.join(process.cwd(), 'extensao-gerid', 'background.js'),
      'utf8',
    );

    const inicio = fonte.indexOf('if (caso.somenteComprovante && caso.protocolo)');
    expect(inicio).toBeGreaterThan(-1);

    // O bloco tem que fechar com `continue` antes de qualquer uma das duas
    // chamadas que abrem requerimento. Se `executarCasoNoGerid` couber dentro
    // dele, o robô cria um SEGUNDO pedido para uma pessoa que já tem protocolo.
    const bloco = fonte.slice(inicio, fonte.indexOf('continue;', inicio));
    expect(bloco).not.toContain('executarCasoNoGerid');
    expect(bloco).not.toContain('baixarAnexos');
    expect(bloco).toContain('conferirNaListaDeTarefas');

    // E o desvio vem antes do caminho normal, não depois.
    expect(inicio).toBeLessThan(fonte.indexOf('const casoComAnexos = {'));
  });
});
