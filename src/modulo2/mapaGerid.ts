/**
 * MAPEAMENTO DAS TELAS DO GERID.
 *
 * Este arquivo é o ÚNICO ponto que precisa de acesso ao Gerid real. Todo o
 * resto do Módulo 2 (navegador, sessão, erros, screenshots, relatório) já está
 * implementado e testado.
 *
 * ⚠️ NÃO INVENTE SELETOR. Preencher isto "no chute" faria o robô protocolar
 * dados errados no INSS em nome de pessoas com deficiência. Enquanto
 * `mapeamentoCompleto()` for false, o robô se recusa a protocolar.
 *
 * Como preencher: abra o Gerid logado, siga
 * docs/checklists/revisao-seletor-playwright.md e anote os rótulos EXATOS.
 */

export interface CampoGerid {
  /** Rótulo acessível do campo, como aparece na tela do Gerid. */
  rotulo: string;
  /** Tipo do controle, para o robô saber como preencher. */
  tipo: 'texto' | 'select' | 'data' | 'arquivo' | 'botao' | 'radio';
}

export interface MapaGerid {
  /** URL da tela inicial (após login). */
  url: string;

  /** Caminho até o formulário: "Novo Requerimento" > "Assistencial à PcD". */
  navegacao: {
    novoRequerimento: CampoGerid | null;
    servicoAssistencialPcD: CampoGerid | null;
  };

  /** Campos do requerente. */
  requerente: {
    cpf: CampoGerid | null;
    autorizacaoCadUnico: CampoGerid | null;
    telefone: CampoGerid | null;
  };

  /**
   * Campos POR INTEGRANTE do grupo familiar.
   * ❗ É a principal pendência: não sabemos quais campos o Gerid pede por
   * integrante (só nome+CPF? parentesco? renda?). Precisa de print da tela.
   */
  grupoFamiliar: {
    adicionarIntegrante: CampoGerid | null;
    campos: CampoGerid[];
  };

  /** Anexos. */
  documentos: {
    inputArquivo: CampoGerid | null;
  };

  /** Seleção de agência (pelo CEP, confirmado com o cliente). */
  agencia: {
    campoCep: CampoGerid | null;
    confirmar: CampoGerid | null;
  };

  /** Finalização e comprovante. */
  finalizacao: {
    finalizar: CampoGerid | null;
    numeroProtocolo: CampoGerid | null;
    baixarComprovante: CampoGerid | null;
  };

  /** O que ainda falta confirmar. Vazio = mapeamento completo. */
  pendencias: string[];
}

export const mapaGerid: MapaGerid = {
  url: process.env.RPA_GERID_URL ?? 'https://gerid.dataprev.gov.br',

  navegacao: {
    novoRequerimento: null,
    servicoAssistencialPcD: null,
  },
  requerente: {
    cpf: null,
    autorizacaoCadUnico: null,
    telefone: null,
  },
  grupoFamiliar: {
    adicionarIntegrante: null,
    campos: [],
  },
  documentos: {
    inputArquivo: null,
  },
  agencia: {
    campoCep: null,
    confirmar: null,
  },
  finalizacao: {
    finalizar: null,
    numeroProtocolo: null,
    baixarComprovante: null,
  },

  pendencias: [
    'rótulos dos campos do requerente (CPF, telefone, autorização CadÚnico)',
    'quais campos o Gerid pede POR INTEGRANTE do grupo familiar',
    'como é a seleção de agência pelo CEP',
    'onde aparece o número do protocolo e como baixar o comprovante',
  ],
};

/** True quando o mapeamento foi confirmado no Gerid real e o robô pode operar. */
export function mapeamentoCompleto(mapa: MapaGerid = mapaGerid): boolean {
  if (mapa.pendencias.length > 0) return false;

  const obrigatorios = [
    mapa.navegacao.novoRequerimento,
    mapa.navegacao.servicoAssistencialPcD,
    mapa.requerente.cpf,
    mapa.documentos.inputArquivo,
    mapa.agencia.campoCep,
    mapa.finalizacao.finalizar,
    mapa.finalizacao.numeroProtocolo,
  ];
  return obrigatorios.every((c) => c !== null) && mapa.grupoFamiliar.campos.length > 0;
}
