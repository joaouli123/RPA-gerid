import type { ArquivoInfo, DocumentoEsperado } from './types';
import { CodigoMotivo, motivo, type MotivoRevisao } from './motivos';
import { normalizar } from './texto';

export interface OpcoesValidacaoDocs {
  documentosEsperados: DocumentoEsperado[];
  limiteTamanhoArquivoBytes: number;
}

/** Um arquivo casa um documento se algum padrão bate no nome (normalizado). */
function arquivoCasaDocumento(arquivo: ArquivoInfo, doc: DocumentoEsperado): boolean {
  const nome = normalizar(arquivo.nome);
  return doc.padroes.some((p) => new RegExp(p, 'i').test(nome));
}

export interface ClassificacaoDocumento {
  doc: DocumentoEsperado;
  /** Arquivos que casaram esse tipo (pode ser vazio = documento ausente). */
  arquivos: ArquivoInfo[];
}

/**
 * Para cada documento esperado, quais arquivos da pasta casam com ele.
 * Fonte única de verdade do "matching" — usada pela validação e pela UI
 * (checklist de documentos). Deliberadamente frágil (casa por nome); ver
 * docs/checklists/validacao-pre-gerid.md.
 */
export function classificarDocumentos(
  arquivos: ArquivoInfo[],
  docs: DocumentoEsperado[],
): ClassificacaoDocumento[] {
  return docs.map((doc) => ({
    doc,
    arquivos: arquivos.filter((a) => arquivoCasaDocumento(a, doc)),
  }));
}

/**
 * Valida a pasta de UM cliente:
 *   - presença dos documentos OBRIGATÓRIOS (por matcher de nome);
 *   - tamanho de cada arquivo relevante contra o limite configurável.
 *
 * Documentos facultativos ausentes NÃO bloqueiam — aparecem só no checklist
 * da tela. Só verifica tamanho dos arquivos que casam algum documento
 * esperado (são esses que o robô vai realmente anexar no Gerid).
 */
export function validarDocumentos(
  arquivos: ArquivoInfo[],
  opcoes: OpcoesValidacaoDocs,
): MotivoRevisao[] {
  const motivos: MotivoRevisao[] = [];
  const relevantes = new Map<string, ArquivoInfo>();

  for (const { doc, arquivos: casados } of classificarDocumentos(
    arquivos,
    opcoes.documentosEsperados,
  )) {
    if (casados.length === 0 && doc.obrigatorio) {
      motivos.push(
        motivo(CodigoMotivo.DOCUMENTO_FALTANDO, `Documento ausente: ${doc.rotulo}.`, {
          tipo: doc.tipo,
          rotulo: doc.rotulo,
        }),
      );
    }
    for (const a of casados) relevantes.set(a.id, a);
  }

  for (const a of relevantes.values()) {
    if (a.tamanhoBytes > opcoes.limiteTamanhoArquivoBytes) {
      motivos.push(
        motivo(
          CodigoMotivo.ARQUIVO_GRANDE_DEMAIS,
          `Arquivo acima do limite: "${a.nome}" (${formatarMB(a.tamanhoBytes)} > ${formatarMB(
            opcoes.limiteTamanhoArquivoBytes,
          )}).`,
          {
            arquivo: a.nome,
            tamanhoBytes: a.tamanhoBytes,
            limiteBytes: opcoes.limiteTamanhoArquivoBytes,
          },
        ),
      );
    }
  }

  return motivos;
}

function formatarMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
