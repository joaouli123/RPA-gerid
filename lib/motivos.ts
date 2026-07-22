import { CodigoMotivo, type CodigoMotivo as Codigo } from '@/src/domain/motivos';

export type TomMotivo = 'vermelho' | 'ambar';

export interface InfoMotivo {
  rotulo: string;
  acao: string;
  tom: TomMotivo;
}

/**
 * Rótulo + ação sugerida por motivo de revisão. Espelha
 * docs/checklists/diagnostico-falha.md — manter em sincronia.
 */
export const infoMotivo: Record<Codigo, InfoMotivo> = {
  [CodigoMotivo.DOCUMENTO_FALTANDO]: {
    rotulo: 'Documento faltando',
    acao: 'Pedir o documento ao cliente / conferir a pasta.',
    tom: 'vermelho',
  },
  [CodigoMotivo.ARQUIVO_GRANDE_DEMAIS]: {
    rotulo: 'Arquivo grande demais',
    acao: 'Compactar/reduzir o PDF antes de reenviar.',
    tom: 'ambar',
  },
  [CodigoMotivo.PASTA_SEM_LINHA_PLANILHA]: {
    rotulo: 'Pasta sem linha na planilha',
    acao: 'Cadastrar o cliente na aba Clientes.',
    tom: 'ambar',
  },
  [CodigoMotivo.LINHA_SEM_PASTA]: {
    rotulo: 'Linha sem pasta no Drive',
    acao: 'Criar a pasta / corrigir o nome na coluna pasta.',
    tom: 'ambar',
  },
  [CodigoMotivo.DADOS_INCOMPLETOS]: {
    rotulo: 'Dados incompletos',
    acao: 'Completar a linha na planilha.',
    tom: 'vermelho',
  },
  [CodigoMotivo.GRUPO_FAMILIAR_AUSENTE]: {
    rotulo: 'Grupo familiar ausente',
    acao: 'Preencher a aba GrupoFamiliar (ao menos o Titular).',
    tom: 'vermelho',
  },
  [CodigoMotivo.GRUPO_FAMILIAR_INVALIDO]: {
    rotulo: 'Grupo familiar inválido',
    acao: 'Corrigir os integrantes na planilha.',
    tom: 'vermelho',
  },
};

export function infoDoMotivo(codigo: Codigo): InfoMotivo {
  return (
    infoMotivo[codigo] ?? { rotulo: codigo, acao: 'Revisar manualmente.', tom: 'ambar' }
  );
}
