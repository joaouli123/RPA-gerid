import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * O comprovante na FICHA DO CLIENTE.
 *
 * A tela de Execução só mostra o lote que está rodando; passado o dia, o lote
 * sai da tela e o PDF vira caça ao tesouro no histórico. Quem liga perguntando
 * "saiu o meu?" é atendido pelo CPF, então é pelo CPF que o arquivo tem que ser
 * encontrável.
 *
 * A pegadinha coberta aqui: o comprovante quase nunca está na execução que
 * gerou o protocolo. Ele costuma chegar numa rodada POSTERIOR, no modo
 * só-comprovante — e é o id DESSA rodada que o link de download precisa.
 */
const PASTA_TMP = path.join(os.tmpdir(), `rpa-gerid-comprov-${process.pid}`);
process.env.RPA_ESTADO_ARQUIVO = path.join(PASTA_TMP, 'estado.json');

const store = await import('@/lib/server/store');

/** Mesma convenção de nome do store: id da execução + CPF só em dígitos. */
function arquivoNoDisco(idExecucao: string, cpf: string): string {
  return path.join(PASTA_TMP, 'comprovantes', `${idExecucao}__${cpf.replace(/\D/g, '')}.pdf`);
}

let cpfAlvo = '';
let idDoProtocolo = '';
let idDoComprovante = '';

beforeAll(async () => {
  await fs.mkdir(PASTA_TMP, { recursive: true });

  // 1ª rodada: sai o protocolo, o PDF não vem.
  const primeira = await store.iniciarExecucao();
  const alvo = primeira.casos[0];
  if (!alvo) throw new Error('A fila de exemplo veio vazia.');
  cpfAlvo = alvo.cpf;
  idDoProtocolo = primeira.id;
  await store.atualizarStatusCaso(primeira.id, cpfAlvo, 'sucesso', undefined, '1555659503');
  await store.finalizarExecucao(primeira.id);
  await store.limparExecucaoAtual();

  // 2ª rodada: o cliente volta só atrás do comprovante, e agora o PDF chega.
  const segunda = await store.iniciarExecucao();
  idDoComprovante = segunda.id;
  await store.atualizarStatusCaso(segunda.id, cpfAlvo, 'sucesso', undefined, '1555659503');
  await store.anexarComprovanteAoCaso(
    segunda.id,
    cpfAlvo,
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    'comprovante 1555659503.pdf',
    { destino: 'local', referencia: 'saida/1555659503.pdf' },
  );
  await store.finalizarExecucao(segunda.id);
  await store.limparExecucaoAtual();
});

afterAll(async () => {
  await fs.rm(PASTA_TMP, { recursive: true, force: true });
});

describe('comprovante encontrável pela ficha do cliente', () => {
  it('aponta para a execução que TEM o PDF, não para a que gerou o protocolo', async () => {
    const registro = await store.protocoloDoCpf(cpfAlvo);

    expect(registro?.protocolo).toBe('1555659503');
    expect(registro?.comprovante?.nome).toBe('comprovante 1555659503.pdf');
    // O link é montado com este id. Usar o da 1ª rodada devolveria 404 num
    // arquivo que está guardado — e o operador concluiria que o PDF sumiu.
    expect(registro?.idExecucaoDoComprovante).toBe(idDoComprovante);
    expect(registro?.idExecucaoDoComprovante).not.toBe(idDoProtocolo);
    expect(registro?.arquivoDisponivel).toBe(true);
  });

  it('acha o arquivo mesmo com o CPF mascarado da tela', async () => {
    const digitos = cpfAlvo.replace(/\D/g, '').padStart(11, '0');
    const mascarado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;

    const pdf = await store.lerComprovanteDoCaso(idDoComprovante, mascarado);
    expect(pdf?.nome).toBe('comprovante 1555659503.pdf');
  });

  it('não oferece download quando o arquivo sumiu do disco', async () => {
    // Deploy sem volume persistente apaga `.data/comprovantes/` e deixa só a
    // anotação. Um botão "Baixar" que responde 404 é pior do que dizer na cara
    // que a cópia se perdeu e que o original está no Drive.
    const arquivo = arquivoNoDisco(idDoComprovante, cpfAlvo);
    await fs.rename(arquivo, `${arquivo}.guardado`);
    try {
      const registro = await store.protocoloDoCpf(cpfAlvo);
      expect(registro?.comprovante).toBeDefined();
      expect(registro?.arquivoDisponivel).toBe(false);
      expect(await store.lerComprovanteDoCaso(idDoComprovante, cpfAlvo)).toBeNull();
    } finally {
      await fs.rename(`${arquivo}.guardado`, arquivo);
    }
  });

  it('quem nunca foi protocolado não tem protocolo nenhum atribuído', async () => {
    // CPF fictício, fora da base de exemplo.
    expect(await store.protocoloDoCpf('000.000.000-00')).toBeNull();
  });
});
