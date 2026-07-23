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

  // 23/07/2026 — telas mapeadas (docs/gerid-fluxo-real.md) e DECISÕES do
  // escritório já codificadas e testadas em src/modulo2/regrasPreenchimento.ts:
  //   - respostas fixas (Não/Não/residência/...); estado civil padrão Solteiro;
  //   - forma de convívio derivada do grupo; parentesco -> grupos do GERID;
  //   - unidade escolhida pela cidade do cliente; biometria = seguir até o fim
  //     (o Fabrício resolve em cumprimento de exigência); humano-no-laço.
  //
  // Falta: (a) escrever o preenchimento Playwright dos passos 1–9 usando essas
  // regras e PARANDO no Confirmar; (b) validar os SELETORES num run
  // supervisionado no GERID real — eles vieram de PRINTS, não do DOM ao vivo,
  // então precisam ser conferidos contra a página antes de confiar. Enquanto
  // isso não acontecer, o robô continua se recusando a protocolar.
  pendencias: [
    'IMPLEMENTAR: preenchimento Playwright dos passos 1–9 (regras já prontas em ' +
      'regrasPreenchimento.ts), parando no Confirmar para revisão humana',
    'VALIDAR: seletores num run supervisionado no GERID real (vieram de prints, ' +
      'não do DOM); rótulos marcados VERIFICAR (opção "sozinho", parentescos não ' +
      'confirmados) precisam ser conferidos na tela',
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
