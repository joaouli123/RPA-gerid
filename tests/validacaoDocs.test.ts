import { describe, it, expect } from 'vitest';
import { classificarDocumentos, validarDocumentos } from '../src/domain/validacaoDocs';
import { configPadrao } from '../config/default';
import type { ArquivoInfo } from '../src/domain/types';
import { CodigoMotivo } from '../src/domain/motivos';

const MB = 1024 * 1024;

function arq(nome: string, mb = 0.4): ArquivoInfo {
  return { id: nome, nome, tamanhoBytes: Math.round(mb * MB), mimeType: 'application/pdf' };
}

const opcoes = {
  documentosEsperados: configPadrao.documentosEsperados,
  limiteTamanhoArquivoBytes: 5 * MB,
};

const OBRIGATORIOS = [
  arq('Termo de representação.pdf'),
  arq('Procuração.pdf'),
  arq('Documentos pessoais.pdf'),
  arq('OAB.pdf', 1.3),
];

const FACULTATIVOS = [arq('Documentos médicos.pdf', 2), arq('Cadastro único.pdf', 0.3)];

describe('classificarDocumentos (nomes reais do Drive)', () => {
  it('casa cada arquivo real com exatamente um tipo', () => {
    const classificacao = classificarDocumentos(
      [...OBRIGATORIOS, ...FACULTATIVOS],
      configPadrao.documentosEsperados,
    );
    for (const { doc, arquivos } of classificacao) {
      expect(arquivos, `documento ${doc.tipo}`).toHaveLength(1);
    }
  });

  it('não confunde "Procuração" com "Termo de representação"', () => {
    const classificacao = classificarDocumentos(
      [arq('Procuração.pdf')],
      configPadrao.documentosEsperados,
    );
    const casados = classificacao.filter((c) => c.arquivos.length > 0).map((c) => c.doc.tipo);
    expect(casados).toEqual(['PROCURACAO']);
  });
});

describe('validarDocumentos', () => {
  it('aceita pasta com os 4 obrigatórios + 2 facultativos', () => {
    expect(validarDocumentos([...OBRIGATORIOS, ...FACULTATIVOS], opcoes)).toEqual([]);
  });

  it('facultativo ausente NÃO bloqueia', () => {
    expect(validarDocumentos(OBRIGATORIOS, opcoes)).toEqual([]);
  });

  it('obrigatório ausente bloqueia', () => {
    const semProcuracao = OBRIGATORIOS.filter((a) => !a.nome.includes('Procura'));
    const motivos = validarDocumentos([...semProcuracao, ...FACULTATIVOS], opcoes);
    expect(motivos).toHaveLength(1);
    expect(motivos[0]?.codigo).toBe(CodigoMotivo.DOCUMENTO_FALTANDO);
    expect(motivos[0]?.contexto?.tipo).toBe('PROCURACAO');
  });

  it('pasta vazia acusa só os 4 obrigatórios', () => {
    const motivos = validarDocumentos([], opcoes);
    expect(motivos).toHaveLength(4);
    expect(motivos.every((m) => m.codigo === CodigoMotivo.DOCUMENTO_FALTANDO)).toBe(true);
    expect(motivos.map((m) => m.contexto?.tipo).sort()).toEqual([
      'DOCUMENTOS_PESSOAIS',
      'OAB',
      'PROCURACAO',
      'TERMO_REPRESENTACAO',
    ]);
  });

  it('sinaliza arquivo acima do limite de 5 MB (caso real do laudo de 5,6 MB)', () => {
    const motivos = validarDocumentos(
      [...OBRIGATORIOS, arq('Documentos médicos.pdf', 5.6)],
      opcoes,
    );
    expect(motivos.map((m) => m.codigo)).toEqual([CodigoMotivo.ARQUIVO_GRANDE_DEMAIS]);
    expect(motivos[0]?.contexto?.arquivo).toBe('Documentos médicos.pdf');
  });

  it('bloqueia quando a soma dos anexos ultrapassa 50 MB', () => {
    const arquivos = Array.from({ length: 11 }, (_, indice) =>
      arq(`documento-${indice}.pdf`, 4.9),
    );
    const documentosEsperados = [{
      tipo: 'DOCUMENTOS_PESSOAIS',
      rotulo: 'Documentos pessoais',
      obrigatorio: true,
      padroes: ['documento'],
    }];

    const motivos = validarDocumentos(arquivos, {
      documentosEsperados,
      limiteTamanhoArquivoBytes: 5 * MB,
    });

    expect(motivos.some((item) => item.codigo === CodigoMotivo.ANEXOS_TOTAL_GRANDE_DEMAIS)).toBe(true);
    expect(motivos.some((item) => item.codigo === CodigoMotivo.ARQUIVO_GRANDE_DEMAIS)).toBe(false);
  });

  it('arquivo exatamente no limite não é sinalizado', () => {
    expect(validarDocumentos([...OBRIGATORIOS, arq('Documentos médicos.pdf', 5)], opcoes)).toEqual(
      [],
    );
  });
});
