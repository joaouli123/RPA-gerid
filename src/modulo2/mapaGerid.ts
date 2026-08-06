/**
 * MAPEAMENTO DAS TELAS DO GERID — seletores reais.
 *
 * Preenchido em 28/07/2026 a partir do DOM da aplicação em produção
 * (`https://atendimento.inss.gov.br`), com o Fabrício ao vivo.
 * Fonte completa: docs/gerid-mapeamento-real.md.
 *
 * ⚠️ NÃO INVENTE SELETOR. Enquanto `mapeamentoCompleto()` for false, o robô se
 * recusa a protocolar sozinho — de propósito.
 *
 * TRÊS ARMADILHAS ESTRUTURAIS QUE VALEM PARA TODO SELETOR AQUI:
 *
 * 1. É uma SPA e o DOM NUNCA é limpo. O conteúdo de todas as etapas já
 *    visitadas continua no HTML, apenas oculto. No passo 3 já havia 3 pares de
 *    "Voltar/Avançar" simultâneos. Por isso:
 *      - navegação usa os ids estáveis `#btn-prev` / `#btn-next`;
 *      - qualquer busca por texto/role exige visibilidade.
 *
 * 2. IDs SE REPETEM entre componentes. O radio `1` é "Solteiro" no estado
 *    civil e "Cônjuge" no parentesco; os 11 `input[type=file]` compartilham
 *    `id="single-file"`. Sempre escopar no container do componente.
 *
 * 3. Os "selects" NÃO são `<select>`. São comboboxes customizados
 *    (`<input type="text" role="combobox">`) com um container irmão
 *    `{id}-itens` guardando as opções como `<input type="radio">`.
 *    `page.selectOption()` não funciona: é clicar no combobox e clicar na opção.
 */

/** Convenção de id observada no GERID. */
export const PADROES_ID = {
  /** Container de opções de qualquer combobox. */
  itens: (idCombobox: string) => `${idCombobox}-itens`,
  /** Checkbox: sempre começa com "campo-". */
  checkbox: (sufixo: string) => `campo-${sufixo}`,
} as const;

export const NAVEGACAO = {
  avancar: '#btn-next',
  voltar: '#btn-prev',
  novoRequerimento: 'Novo Requerimento',
} as const;

export interface MapaGerid {
  url: string;
  urlTarefas: string;

  passo1: {
    campoBusca: string;
    containerOpcoes: string;
    /** id do radio do serviço BPC PcD. */
    servicoBpcPcd: string;
  };

  passo2: {
    cpf: string;
    dataNascimento: string;
    nome: string;
    acompanharProcessoSim?: string;
    acompanharProcessoNao?: string;
    paisesAcordo?: string;
  };

  passo3: {
    autorizacaoCadUnico: string;
  };

  passo4: {
    /** Comboboxes indexados por linha. Requerente = índice 0. */
    parentesco: (i: number) => string;
    estadoCivil: (i: number) => string;
    /** Checkbox "Há alguém que você queira incluir ou excluir?" */
    incluirExcluirNao: string;
    incluirExcluirSim: string;
  };

  passo7: {
    tipoContato: string;
    /** Os anexos não têm id único: todos são `input[type=file]#single-file`. */
    inputArquivo: string;
    totalSlots: number;
  };

  passo8: {
    /** ⚠️ único campo do fluxo SEM id — localizar pelo rótulo. */
    cepRotulo: string;
    cepPlaceholder: string;
    abaCep: string;
    abaMunicipio: string;
    buscar: string;
  };

  passo10: {
    declaracaoConfirmar: string;
  };

  /** O que ainda falta confirmar. Vazio = mapeamento completo. */
  pendencias: string[];
}

export const mapaGerid: MapaGerid = {
  url: process.env.RPA_GERID_URL ?? 'https://atendimento.inss.gov.br',
  urlTarefas: 'https://atendimento.inss.gov.br/tarefas',

  passo1: {
    campoBusca: 'input[id="idSelecionarServico"]',
    containerOpcoes: '#idSelecionarServico-itens',
    servicoBpcPcd: '1655',
  },

  passo2: {
    // ⚠️ o id TEM um ponto: `#idRequerente.cpf` em CSS vira id + classe.
    cpf: 'input[id="idRequerente.cpf"]',
    dataNascimento: 'input[id="nascimentoRequerente"]',
    nome: 'input[id="nomeRequerente"]',
    // Mapeamentos novos (ex: Acordo Internacional / Acompanhar Processo)
    acompanharProcessoSim: 'input[id="acompanharProcesso-Sim"]',
    acompanharProcessoNao: 'input[id="acompanharProcesso-Nao"]',
    paisesAcordo: 'input[id="paisesAcordo"]',
  },

  passo3: {
    autorizacaoCadUnico: 'input[id="campo-autorizacaoCadunico"]',
  },

  passo4: {
    parentesco: (i: number) => `#selectParentesco${i}`,
    estadoCivil: (i: number) => `#selectEstadoCivil${i}`,
    // ⚠️ o prefixo "undefined-" é bug de template do INSS; pode sumir se
    // corrigirem. Por isso o robô tenta por id e cai para o rótulo.
    incluirExcluirNao: 'input[id="undefined-Nao"]',
    incluirExcluirSim: 'input[id="undefined-Sim"]',
  },

  passo7: {
    tipoContato: '#selectTipoContato',
    inputArquivo: 'input[type="file"]',
    totalSlots: 11,
  },

  passo8: {
    cepRotulo: 'CEP',
    cepPlaceholder: '__.___-___',
    abaCep: 'Consultar por CEP',
    abaMunicipio: 'Consultar por Município',
    buscar: 'Buscar',
  },

  passo10: {
    declaracaoConfirmar: 'input[id="campo-declaracaoConfirmar"]',
  },

  // -------------------------------------------------------------------------
  // 28/07/2026 — passos 1 a 7 mapeados a partir do DOM real e validados com o
  // Fabrício. Correções aplicadas em regrasPreenchimento.ts (estado civil,
  // parentesco, escolha de unidade). O que falta é só o fim do fluxo:
  // -------------------------------------------------------------------------
  pendencias: ['Mapear o elemento clicavel das listas de unidade e orgao pagador.'],
};

/**
 * True quando o robô pode protocolar.
 */
export function mapeamentoCompleto(mapa: MapaGerid = mapaGerid): boolean {
  return mapa.pendencias.length === 0;
}

/**
 * True quando o robô pode PREENCHER até a tela de Confirmar e parar.
 *
 * Este é o modo de operação escolhido pelo escritório (humano no laço) e não
 * depende das pendências acima: preencher e parar não envia nada ao INSS, e
 * o que não der para preencher vira aviso na tela de revisão.
 *
 * Os passos 1 a 7 estão mapeados contra o DOM real — por isso é true.
 */
export function preenchimentoAteConfirmarDisponivel(): boolean {
  return true;
}
