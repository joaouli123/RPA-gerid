import { describe, it, expect } from 'vitest';
import { lerDados } from '../src/modulo1/lerDados';
import { carregarConfig } from '../config/default';
import { criarDemo } from '../examples/demoData';
import { CodigoMotivo } from '../src/domain/motivos';
import type { ResultadoLeitura } from '../src/domain/types';

const config = carregarConfig({
  RPA_PASTA_RAIZ_ID: 'demo',
  RPA_SPREADSHEET_ID: 'demo',
});

async function rodarDemo(): Promise<ResultadoLeitura> {
  const { drive, sheets } = criarDemo();
  return lerDados(config, drive, sheets);
}

function revisao(r: ResultadoLeitura, pasta: string) {
  return r.clientesParaRevisao.find((c) => c.pasta === pasta);
}

describe('lerDados (integração Módulo 1)', () => {
  it('classifica o dataset de demonstração corretamente', async () => {
    const r = await rodarDemo();
    expect(r.resumo).toEqual({ total: 7, prontos: 2, revisao: 5 });
  });

  it('ignora a pasta "Protocolado" (destino, não é cliente)', async () => {
    const r = await rodarDemo();
    const nomes = [
      ...r.clientesProntos.map((c) => c.cliente.nome),
      ...r.clientesParaRevisao.map((c) => c.pasta),
    ];
    expect(nomes).not.toContain('Protocolado');
  });

  it('MARIA e JOÃO ficam prontos; JOÃO passa mesmo sem os facultativos', async () => {
    const r = await rodarDemo();
    const nomes = r.clientesProntos.map((c) => c.cliente.nome).sort();
    expect(nomes).toEqual(['JOÃO SILVA', 'MARIA SOUZA DE OLIVEIRA']);

    const maria = r.clientesProntos.find((c) => c.cliente.nome === 'MARIA SOUZA DE OLIVEIRA');
    expect(maria?.grupoFamiliar.integrantes).toHaveLength(2);

    // João não tem Documentos médicos nem Cadastro único (facultativos).
    const joao = r.clientesProntos.find((c) => c.cliente.nome === 'JOÃO SILVA');
    expect(joao?.arquivos.map((a) => a.nome)).not.toContain('Documentos médicos.pdf');
  });

  it('recompõe o zero à esquerda do CPF que a planilha guardou como número', async () => {
    const r = await rodarDemo();
    const joao = r.clientesProntos.find((c) => c.cliente.nome === 'JOÃO SILVA');
    // Na planilha está "9876543210" (10 dígitos).
    expect(joao?.cliente.cpf).toBe('09876543210');
    // E o grupo familiar dele foi encontrado apesar disso.
    expect(joao?.grupoFamiliar.integrantes).toHaveLength(1);
  });

  it('ANTONIO cai em revisão pelo laudo de 5,6 MB acima do limite de 5 MB', async () => {
    const r = await rodarDemo();
    const antonio = revisao(r, 'ANTONIO CARLOS DE SOUZA');
    expect(antonio?.motivos.map((m) => m.codigo)).toEqual([CodigoMotivo.ARQUIVO_GRANDE_DEMAIS]);
  });

  it('PEDRO cai em revisão só por falta da Procuração', async () => {
    const r = await rodarDemo();
    const pedro = revisao(r, 'PEDRO LIMA');
    expect(pedro?.motivos.map((m) => m.codigo)).toEqual([CodigoMotivo.DOCUMENTO_FALTANDO]);
    expect(pedro?.motivos[0]?.contexto?.tipo).toBe('PROCURACAO');
    expect(pedro?.grupoFamiliar?.integrantes).toHaveLength(4);
  });

  it('ANA cai em revisão por CEP em branco', async () => {
    const r = await rodarDemo();
    const ana = revisao(r, 'ANA COSTA');
    expect(ana?.motivos.map((m) => m.codigo)).toEqual([CodigoMotivo.DADOS_INCOMPLETOS]);
    expect(ana?.motivos[0]?.contexto?.campos).toEqual(['cep']);
  });

  it('mantém os dados coletados mesmo para quem cai em revisão', async () => {
    const r = await rodarDemo();

    const pedro = revisao(r, 'PEDRO LIMA');
    expect(pedro?.cliente?.nome).toBe('PEDRO LIMA');
    expect(pedro?.arquivos?.length).toBeGreaterThan(0);

    const fantasma = revisao(r, 'Cliente Fantasma');
    expect(fantasma?.cliente).toBeUndefined();
    expect(fantasma?.arquivos).toHaveLength(1);

    const carlos = revisao(r, 'CARLOS EXTRA');
    expect(carlos?.cliente?.nome).toBe('CARLOS EXTRA');
    expect(carlos?.grupoFamiliar?.integrantes).toHaveLength(1);
    expect(carlos?.arquivos).toBeUndefined();
  });

  it('detecta pasta órfã e linha órfã', async () => {
    const r = await rodarDemo();
    expect(revisao(r, 'Cliente Fantasma')?.motivos[0]?.codigo).toBe(
      CodigoMotivo.PASTA_SEM_LINHA_PLANILHA,
    );
    expect(revisao(r, 'CARLOS EXTRA')?.motivos[0]?.codigo).toBe(CodigoMotivo.LINHA_SEM_PASTA);
  });
});
