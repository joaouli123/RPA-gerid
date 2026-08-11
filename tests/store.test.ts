import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Testes da camada funcional do app (estado do servidor): persistência de
 * config, ações da fila de revisão e o job de execução. É o que garante que os
 * botões da UI fazem algo de verdade — e que sobrevive a reload/restart.
 *
 * O arquivo de estado é redirecionado para uma pasta temporária, então estes
 * testes não tocam no `.data/` do app.
 */

const PASTA_TMP = path.join(os.tmpdir(), `rpa-gerid-teste-${process.pid}`);
process.env.RPA_ESTADO_ARQUIVO = path.join(PASTA_TMP, 'estado.json');
process.env.RPA_PAUSA_EXECUCAO_MS = '10'; // execução rápida no teste

// Importado depois de definir as variáveis de ambiente.
const store = await import('@/lib/server/store');

beforeAll(async () => {
  await fs.mkdir(PASTA_TMP, { recursive: true });
});

afterAll(async () => {
  await fs.rm(PASTA_TMP, { recursive: true, force: true });
});

async function estadoNoDisco(): Promise<Record<string, unknown>> {
  const bruto = await fs.readFile(process.env.RPA_ESTADO_ARQUIVO as string, 'utf8');
  return JSON.parse(bruto) as Record<string, unknown>;
}

describe('config', () => {
  it('salva overrides e reflete no getConfig', async () => {
    const antes = await store.getConfig();
    // Limite informado pelo Gerid: 5 MB por arquivo.
    expect(antes.limiteTamanhoArquivoBytes).toBe(5 * 1024 * 1024);

    await store.salvarConfig({
      limiteTamanhoArquivoBytes: 25 * 1024 * 1024,
      telefonePadrao: '(81) 3333-4444',
    });

    const depois = await store.getConfig();
    expect(depois.limiteTamanhoArquivoBytes).toBe(25 * 1024 * 1024);
    expect(depois.telefonePadrao).toBe('(81) 3333-4444');
  });

  it('persiste a config em disco', async () => {
    const disco = await estadoNoDisco();
    expect(disco.overridesConfig).toMatchObject({ telefonePadrao: '(81) 3333-4444' });
  });

  it('mudar o limite muda a classificação dos casos', async () => {
    // Com 5 MB, o laudo de 5,6 MB do ANTONIO o joga para revisão.
    await store.salvarConfig({ limiteTamanhoArquivoBytes: 5 * 1024 * 1024 });
    const com5MB = await store.getResultado(true);
    expect(com5MB.resumo.prontos).toBe(2);
    const antonio = com5MB.clientesParaRevisao.find((c) =>
      c.pasta.startsWith('ANTONIO'),
    );
    expect(antonio?.motivos.map((m) => m.codigo)).toEqual(['ARQUIVO_GRANDE_DEMAIS']);

    // Com 10 MB o laudo passa e o ANTONIO entra nos prontos.
    await store.salvarConfig({ limiteTamanhoArquivoBytes: 10 * 1024 * 1024 });
    const com10MB = await store.getResultado(true);
    expect(com10MB.resumo.prontos).toBe(3);

    await store.salvarConfig({ limiteTamanhoArquivoBytes: 5 * 1024 * 1024 });
    await store.getResultado(true);
  });
});

describe('ações da fila de revisão', () => {
  const chave = 'DOCUMENTO_FALTANDO|Pedro Lima|390.533.447-05';

  it('registra, persiste e remove uma ação', async () => {
    await store.registrarAcaoRevisao(chave, 'resolvido');

    const acoes = await store.getAcoesRevisao();
    expect(acoes[chave]?.acao).toBe('resolvido');
    expect(acoes[chave]?.em).toBeTruthy();

    const disco = await estadoNoDisco();
    expect((disco.acoesRevisao as Record<string, unknown>)[chave]).toBeTruthy();

    await store.limparAcaoRevisao(chave);
    expect((await store.getAcoesRevisao())[chave]).toBeUndefined();
  });
});

describe('execução', () => {
  it('NUNCA marca sucesso sem protocolo real do Gerid', async () => {
    const inicial = await store.iniciarExecucao();
    expect(inicial.status).toBe('rodando');
    expect(inicial.casos).toHaveLength(2);
    expect(inicial.casos.every((c) => c.status === 'pendente')).toBe(true);

    // O robô real vai falhar aqui (sem sessão do Gerid / mapeamento pendente).
    // O comportamento correto é marcar ERRO, nunca inventar protocolo.
    const limite = Date.now() + 60000;
    let atual = await store.getExecucaoAtual();
    while (atual?.status === 'rodando' && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 250));
      atual = await store.getExecucaoAtual();
    }

    expect(atual?.status).not.toBe('rodando');

    // A regra de ouro: sucesso exige número de protocolo.
    for (const caso of atual?.casos ?? []) {
      if (caso.status === 'sucesso') expect(caso.protocolo).toBeTruthy();
      if (caso.status === 'erro') expect(caso.motivoErro).toBeTruthy();
      // Nenhum caso pode ficar pendente depois de concluída.
      expect(caso.status).not.toBe('pendente');
      expect(caso.status).not.toBe('processando');
    }

    // Sem Gerid disponível no ambiente de teste, todos devem ser erro.
    expect(atual?.casos.every((c) => c.status === 'erro')).toBe(true);

    const gravada = (await store.getExecucoes()).find((e) => e.id === inicial.id);
    expect(gravada).toBeDefined();
    expect(gravada?.sucesso).toBe(0);
    expect(gravada?.erro).toBe(2);
  }, 90000);

  it('persiste o heartbeat e o estado de autenticacao da extensao', async () => {
    const inicial = await store.iniciarExecucao();
    const antes = Date.parse(inicial.ultimoSinalEm as string);
    const atualizada = await store.registrarSinalExtensao(
      inicial.id,
      'autenticacao_necessaria',
      'Aguardando SafeID.',
    );

    expect(atualizada).toMatchObject({
      id: inicial.id,
      estadoGerid: 'autenticacao_necessaria',
      detalheGerid: 'Aguardando SafeID.',
    });
    expect(Date.parse(atualizada?.ultimoSinalEm as string)).toBeGreaterThanOrEqual(antes);

    const disco = await estadoNoDisco();
    expect(disco.execucaoAtual).toMatchObject({
      estadoGerid: 'autenticacao_necessaria',
      detalheGerid: 'Aguardando SafeID.',
    });

    await store.finalizarExecucao(inicial.id);
  });

  it('o histórico fica persistido em disco', async () => {
    const disco = await estadoNoDisco();
    expect(Array.isArray(disco.execucoes)).toBe(true);
    expect((disco.execucoes as unknown[]).length).toBeGreaterThan(0);
  });
});
