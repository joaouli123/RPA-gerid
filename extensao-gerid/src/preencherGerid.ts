import { MockPage as Page, type Locator } from './playwright-polyfill';

// Este arquivo roda dentro do content script, onde `chrome` existe. O typecheck
// do repo nao carrega @types/chrome (o painel Next nao precisa dele), entao a
// forma minima que este arquivo usa fica declarada aqui mesmo — escopo do
// modulo, sem poluir o global do painel.
declare const chrome: {
  runtime: { sendMessage(mensagem: unknown): Promise<{ ok?: boolean } | undefined> };
};
import { ErroGerid, FalhaGerid, type CasoParaProtocolar } from './tiposGerid';
import { apenasDigitos, normalizar } from './domain/texto';
import { mapaGerid, NAVEGACAO } from './mapaGerid';
import {
  capturarDiagnosticoGerid,
  detectarEstadoGerid,
  listarPerguntasObrigatoriasPendentes,
  resumirDiagnosticoGerid,
  type EtapaGerid,
} from './estadoGerid';
import {
  RESPOSTAS_FIXAS,
  PERGUNTAS_PASSO7,
  SERVICO_BPC_PCD,
  RESPOSTA_BOLSA_FAMILIA,
  estadoCivilGerid,
  mapearParentesco,
  formaDeConvivio,
  slotGeridDoDocumento,
  indiceSlotDoDocumento,
  extensaoAceita,
  SLOTS_GERID,
  PROTOCOLAR_AUTOMATICAMENTE,
} from './regrasPreenchimento';
import { detectarProtocoloEmTexto, protocoloNaTelaDeTarefa } from './detectarProtocolo';
import { decidirModalDoEnvio } from './modaisDoEnvio';

/**
 * PREENCHIMENTO DO REQUERIMENTO NO GERID — passos 1 a 9, parando no Confirmar.
 *
 * Seletores capturados do DOM real em 28/07/2026 (docs/gerid-mapeamento-real.md).
 *
 * Decisão de arquitetura, revista em 12/08/2026: o robô agora CONCLUI — marca a
 * declaração, avança e confirma no modal "Atenção" — quando
 * `PROTOCOLAR_AUTOMATICAMENTE` está ligado e nenhuma etapa deixou pendência.
 * Antes ele parava na tela Confirmar para o advogado concluir na mão; esse
 * comportamento continua disponível desligando a chave.
 *
 * O passo 10 é o único ponto irreversível do sistema, então ele tem regra
 * própria (`passo10ConfirmarEProtocolar`) e só reporta sucesso com o número de
 * protocolo devolvido pelo GERID.
 *
 * PRINCÍPIO: o que o robô não conseguir preencher com certeza vira AVISO, não
 * chute. Avisos aparecem para o advogado revisar antes de concluir.
 */

export interface ArquivoLocal {
  /** Tipo do documento (TERMO_REPRESENTACAO, DOCUMENTOS_MEDICOS, ...). */
  tipo: string;
  /** Caminho no disco local do arquivo já baixado do Drive. */
  caminho: string | { nome: string; mimeType?: string; base64: string };
  /** Nome original, para validar extensão. */
  nome?: string;
}

export interface OpcoesPreenchimento {
  procuradorCpf: string;
  telefonePadrao: string;
  emailEscritorio: string;
  arquivos: ArquivoLocal[];
}

export interface ResultadoPreenchimento {
  pronto: boolean;
  telaAtual: string;
  /** Conferências para o humano. Nunca é erro fatal. */
  avisos: string[];
  /**
   * Número devolvido pelo GERID na tela do comprovante. Ausente = NÃO
   * protocolado — é o que separa "preenchido" de "protocolado", e é a única
   * prova aceita de sucesso (ver "nada de dado simulado" no CLAUDE.md).
   */
  protocolo?: string;
  /** Texto do comprovante, para o Módulo 3 arquivar na pasta do cliente. */
  comprovante?: string;
}

export type RelatarTempoEtapa = (etapa: string, duracaoMs: number) => void;

async function executarEtapa<T>(
  etapa: string,
  executar: () => Promise<T>,
  relatarTempo: RelatarTempoEtapa,
): Promise<T> {
  const inicio = performance.now();
  try {
    return await executar();
  } finally {
    relatarTempo(etapa, Math.round(performance.now() - inicio));
  }
}

/** Ordem real do wizard. Serve para saber o que o GERID JÁ tem preenchido. */
const ORDEM_ETAPAS: EtapaGerid[] = [
  'passo_1', 'passo_2', 'passo_3', 'passo_4', 'passo_5',
  'passo_6', 'passo_7', 'passo_8', 'passo_9', 'passo_10',
  // `comprovante` fecha a lista para que uma tela JÁ protocolada conte como
  // "depois de tudo". Fora da lista ela valia -1, e -1 não é "passou de"
  // nenhuma etapa: o robô recomeçaria do passo 1 em cima de um requerimento
  // que já tinha número de protocolo.
  'comprovante',
];

/** -1 para `desconhecido` — e -1 nunca é "passou de", então nada é pulado no escuro. */
const posicaoEtapa = (etapa: EtapaGerid) => ORDEM_ETAPAS.indexOf(etapa);

export async function preencherRequerimento(
  page: Page,
  caso: CasoParaProtocolar,
  opcoes: OpcoesPreenchimento,
  relatarTempo: RelatarTempoEtapa = () => undefined,
): Promise<ResultadoPreenchimento> {
  const avisos: string[] = [];

  /**
   * O wizard é RETOMÁVEL: se uma tentativa anterior parou no meio, o GERID
   * continua com tudo o que já foi preenchido. Refazer do zero é o que fazia o
   * robô "voltar do começo" — e travar de vez na segunda tentativa, porque o
   * portal recusa dado repetido. Aqui cada etapa só roda se o portal ainda não
   * passou dela; `ate` existe porque uma função nossa pode cobrir duas telas.
   */
  const etapas: Array<{
    id: string;
    marca: EtapaGerid;
    ate?: EtapaGerid;
    tela: string;
    executar: () => Promise<unknown>;
  }> = [
    { id: '1 - servico', marca: 'passo_1', tela: 'Selecionar Serviço',
      executar: () => passo1SelecionarServico(page) },
    { id: '2 - requerente', marca: 'passo_2', tela: 'Informar Requerente',
      executar: () => passo2InformarRequerente(page, caso) },
    { id: '3 - CadUnico', marca: 'passo_3', tela: 'Autorização CadÚnico',
      executar: () => passo3AutorizacaoCadUnico(page) },
    { id: '4 - grupo familiar', marca: 'passo_4', tela: 'Grupo Familiar',
      executar: () => passo4GrupoFamiliar(page, caso, avisos) },
    // Uma função só responde às duas telas de perguntas (gastos e SUAS).
    { id: '5/6 - declaracoes', marca: 'passo_5', ate: 'passo_6', tela: 'Declarações',
      executar: () => passo5e6Perguntas(page, avisos) },
    { id: '7 - dados e anexos', marca: 'passo_7', tela: 'Dados do Requerente',
      executar: () => passo7DadosRequerente(page, caso, opcoes, avisos) },
    // As etapas 8 e 9 usam os componentes reais do GERID: cards `.unidade` e
    // municipio + radio de orgao pagador. Se o portal mudar esses contratos, o
    // robo para na etapa afetada em vez de avancar com um campo vazio.
    { id: '8 - unidade', marca: 'passo_8', tela: 'Selecionar Unidade',
      executar: () => passo8SelecionarUnidade(page, caso, avisos) },
    { id: '9 - orgao pagador', marca: 'passo_9', tela: 'Órgão Pagador',
      executar: () => passo9OrgaoPagador(page, caso, avisos) },
  ];

  for (const etapa of etapas) {
    const onde = posicaoEtapa(detectarEstadoGerid().etapa);
    if (onde > posicaoEtapa(etapa.ate ?? etapa.marca)) {
      avisos.push(`Etapa "${etapa.tela}" já estava preenchida no GERID — retomei sem refazer.`);
      relatarTempo(`${etapa.id} (retomado)`, 0);
      continue;
    }

    // Etapas antigas devolvem `void`; as novas devolvem boolean. Só um `false`
    // explícito é parada — `undefined` significa "terminou sem reclamar".
    const resultado = await executarEtapa(etapa.id, etapa.executar, relatarTempo);

    // Antes de tratar a etapa como falha: o GERID pode estar recusando JUSTAMENTE
    // porque este caso ja foi protocolado numa tentativa anterior. Ele diz o
    // numero. Ignorar isso e insistir criaria um segundo requerimento.
    const jaAberto = pedidoJaEmAberto();
    if (jaAberto) {
      avisos.push(
        `O GERID recusou refazer: ja existe o pedido ${jaAberto} em aberto para este CPF. ` +
        'Nao protocolei de novo - este e o numero do requerimento que ja esta la.',
      );
      return { pronto: true, telaAtual: 'Comprovante', avisos, protocolo: jaAberto };
    }

    if (resultado === false) {
      return { pronto: false, telaAtual: etapa.tela, avisos };
    }
  }

  if (detectarEstadoGerid().etapa !== 'comprovante') {
    await esperarTela(page, /Confirmar|Declaro que li/i);
  }

  const concluido = await executarEtapa(
    '10 - confirmar e protocolar',
    () => passo10ConfirmarEProtocolar(page, avisos),
    relatarTempo,
  );

  return {
    pronto: true,
    telaAtual: concluido.protocolo ? 'Comprovante' : 'Confirmar',
    avisos,
    ...(concluido.protocolo ? { protocolo: concluido.protocolo } : {}),
    ...(concluido.comprovante ? { comprovante: concluido.comprovante } : {}),
  };
}

/**
 * Um aviso significa "olhe isto" ou significa "ficou faltando"?
 *
 * A pergunta só existe porque a resposta decide se o robô protocola. Etapa que
 * FALHA devolve `false` e nem chega aqui, então todo aviso vem de etapa
 * concluída — mas parte deles é justamente o robô dizendo que não conseguiu
 * fazer alguma coisa e passou a bola para o humano. Protocolar por cima de um
 * desses mandaria ao INSS um requerimento que o próprio robô sabe incompleto.
 *
 * Os padrões abaixo são as formas que o código usa para dizer "não consegui".
 * Se um aviso novo aparecer com outra redação, ele NÃO bloqueia — por isso o
 * segundo guarda-corpo (alerta visível na própria tela do GERID) existe.
 */
const AVISO_PENDENTE = /\b(falta|faltou|faltando|n[aã]o consegui|n[aã]o achei|n[aã]o encontrei|complete|preencha|responda|confira|revis|em branco|pendente|manual)/i;

/**
 * O GERID recusando o servico porque JA EXISTE pedido aberto para este CPF.
 *
 * A frase dele e: "Nao e possivel continuar com este servico: O pedido
 * 1555659503 ainda esta em aberto. Aguarde a sua conclusao." Ela aparece logo no
 * inicio, quando o robo refaz um caso que na verdade ja tinha sido protocolado —
 * exatamente o que aconteceu quando o modal de agendamento cobriu o comprovante
 * e o robo terminou sem ler o numero.
 *
 * Ler esse numero e o oposto de inventar dado: e o proprio GERID dizendo qual
 * requerimento existe. Sem isso o robo tentaria de novo a cada rodada, e cada
 * tentativa e um requerimento a mais no nome de uma pessoa real.
 *
 * Exportada porque o `catch` da extensao tambem precisa dela: se a etapa
 * ESTOURAR em vez de devolver `false`, o laco nem chega a perguntar.
 */
function extrairPedidoEmAberto(bruto: string): string {
  const texto = String(bruto || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Exige as tres partes ("pedido" + numero + "em aberto") para nao confundir
  // com CPF, CEP ou qualquer numero solto que esteja na mesma tela.
  return /pedido\s+(\d{6,})[^.]{0,40}?em aberto/i.exec(texto)?.[1] || '';
}

let pedidoAbertoLembrado = '';
let observadorPedidoAberto: MutationObserver | null = null;

/**
 * Vigia a tela inteira em busca do bloqueio, do inicio ao fim do caso.
 *
 * O aviso do GERID pode ser um toast que some sozinho em poucos segundos \u2014
 * antes de o robo terminar de esperar a etapa mudar. Quando some, o numero se
 * perde e o caso vira "erro de tela"; o robo tentaria de novo na proxima rodada,
 * e cada tentativa e um requerimento a mais no nome da mesma pessoa. Por isso a
 * captura e continua, e nao uma leitura pontual.
 *
 * Chamar a cada caso e OBRIGATORIO: o content script vive na MESMA aba entre
 * casos, e um numero lembrado do requerente anterior seria atribuido ao seguinte
 * \u2014 o erro mais grave que este arquivo poderia cometer. Por isso a funcao zera a
 * memoria em vez de so ligar o observador.
 */
export function vigiarPedidoEmAberto(): void {
  pedidoAbertoLembrado = '';
  observadorPedidoAberto?.disconnect();
  observadorPedidoAberto = null;
  if (typeof MutationObserver !== 'function' || !document.body) return;

  observadorPedidoAberto = new MutationObserver((mutacoes) => {
    if (pedidoAbertoLembrado) return;
    for (const mutacao of mutacoes) {
      for (const no of Array.from(mutacao.addedNodes)) {
        const achado = extrairPedidoEmAberto(no.textContent || '');
        if (achado) {
          pedidoAbertoLembrado = achado;
          return;
        }
      }
    }
  });
  observadorPedidoAberto.observe(document.body, { childList: true, subtree: true });
}

export function pedidoJaEmAberto(): string {
  const agora = extrairPedidoEmAberto(document.body?.innerText || '');
  if (agora) pedidoAbertoLembrado = agora;
  return pedidoAbertoLembrado;
}

/**
 * Marca de "isto é só para você saber, não é pendência".
 *
 * O filtro acima fareja PALAVRA em texto livre, e isso já barrou um protocolo
 * legítimo: um aviso que terminava em "Confira os anexos antes de concluir"
 * casou `confira` e derrubou o passo 10 em 0 ms, sem o robô nem olhar a tela.
 *
 * A saída NÃO é afrouxar o filtro — o padrão continua sendo "aviso desconhecido
 * bloqueia", que é o lado seguro do erro. A saída é o autor do aviso declarar,
 * caso a caso, quando o texto é informativo. Só marque assim quando a resposta
 * a "o robô deixou de fazer alguma coisa?" for NÃO.
 */
const MARCA_INFORMATIVO = 'ℹ️ ';

export function avisoInformativo(texto: string): string {
  return `${MARCA_INFORMATIVO}${texto}`;
}

export function avisosQueImpedemProtocolo(avisos: string[]): string[] {
  return avisos.filter(
    (aviso) => !aviso.startsWith(MARCA_INFORMATIVO) && AVISO_PENDENTE.test(aviso),
  );
}

/**
 * PASSO 10 — aceitar a declaração, avançar e confirmar o protocolo.
 *
 * Daqui sai um requerimento protocolado no INSS em nome de uma pessoa real, e
 * não existe desfazer. Todas as travas moram aqui:
 *
 *  1. já está no comprovante -> NÃO confirma de novo (seria um segundo
 *     requerimento para a mesma pessoa), só lê o número;
 *  2. chave desligada -> para e entrega para o humano;
 *  3. aviso de pendência -> para, dizendo qual;
 *  4. alerta visível na tela do GERID -> para, repetindo o que o portal disse;
 *  5. declaração que não marcou -> para (assinar em nome do requerente é o
 *     ato mais sério da tela; se não deu para marcar de verdade, não avança);
 *  6. sem número de protocolo no fim -> devolve vazio, nunca "sucesso".
 */
async function passo10ConfirmarEProtocolar(
  page: Page,
  avisos: string[],
): Promise<{ protocolo: string; comprovante: string }> {
  const nada = { protocolo: '', comprovante: '' };

  /**
   * Recusar protocolar sem dizer em voz alta por quê já custou uma rodada
   * inteira de investigação: as travas abaixo saem em 0 ms e o motivo ia só
   * para o painel, então o console — que é o que se olha na hora — mostrava um
   * "Preenchido para revisão humana" mudo. Agora todo NÃO tem motivo no log.
   */
  const recusar = (motivo: string): { protocolo: string; comprovante: string } => {
    console.log(`[P10] NAO PROTOCOLEI: ${motivo}`);
    avisos.push(motivo);
    return nada;
  };

  if (detectarEstadoGerid().etapa === 'comprovante') {
    const jaFeito = lerComprovante();
    if (jaFeito.protocolo) {
      console.log('[P10] comprovante ja estava na tela; nao confirmei de novo');
      return jaFeito;
    }
    return recusar('A tela do comprovante está aberta, mas não consegui ler o número do protocolo nela.');
  }

  if (!PROTOCOLAR_AUTOMATICAMENTE) {
    return recusar('Preenchimento concluído. O protocolo automático está desligado — confira a tela e conclua.');
  }

  console.log(`[P10] avisos acumulados ate aqui (${avisos.length}):`, JSON.stringify(avisos, null, 1));

  const pendencias = avisosQueImpedemProtocolo(avisos);
  if (pendencias.length) {
    return recusar(
      `NÃO protocolei: ficou ${pendencias.length} pendência(s) para resolver antes — ${pendencias.join(' | ')}`,
    );
  }

  // Segundo guarda-corpo, e o mais forte: o que o PRÓPRIO GERID diz da tela.
  // Só reclamação conta — a tela de conferência também carrega texto em caixa
  // de mensagem (a declaração, o aviso do art. 171 do Código Penal), e tratar
  // isso como erro faria o robô nunca protocolar.
  const reclamacoes = capturarDiagnosticoGerid().alertas
    .filter((alerta) => /obrigat|deve ser preenchid|necess[aá]ri|inv[aá]lid|erro|anexad|corrij|pendent/i.test(alerta));
  if (reclamacoes.length) {
    return recusar(`NÃO protocolei: o GERID está reclamando na tela de conferência — ${reclamacoes.join(' | ')}`);
  }

  // O rótulo do gov.br aponta para o NAME do checkbox ("checkbox-declaracaoConfirmar"),
  // e não para o id do input ("campo-declaracaoConfirmar"): clicar no rótulo não
  // marca nada. É o mesmo defeito do CadÚnico no passo 3, e é por isso que aqui
  // vai `garantirMarcado` (que aciona o React) em vez de um clique ingênuo.
  const declaracao = visivel(page.locator(mapaGerid.passo10.declaracaoConfirmar)).first();
  await declaracao.waitFor({ state: 'visible' }).catch(() => undefined);
  await garantirMarcado(declaracao).catch(() => undefined);
  if (!(await declaracao.isChecked().catch(() => false))) {
    return recusar(
      'Não consegui marcar "Declaro que li e concordo com as informações acima". Marque na tela e conclua.',
    );
  }
  console.log('[P10] declaracao marcada');

  // O número que JÁ estava visível antes de confirmar. Serve de linha de base:
  // sem isso, um protocolo citado em outro canto da tela viraria "sucesso" sem
  // nada ter sido enviado.
  const protocoloAntes = lerComprovante().protocolo;

  const avancarBotao = visivel(page.locator(NAVEGACAO.avancar)).first();
  const ateHabilitar = Date.now() + 10_000;
  while (Date.now() < ateHabilitar && !(await avancarBotao.isEnabled().catch(() => false))) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await avancarBotao.click();
  console.log('[P10] avancar clicado; esperando o modal de confirmacao');

  const modais = await confirmarModaisDoEnvio(page);
  if (!modais.confirmou) {
    // Se havia modal na tela, a frase dele vale mais do que qualquer suposição
    // nossa: é o texto que diz por que o robô não avançou, e é o que permite
    // escrever a regra depois — sem inventar seletor a partir de palpite.
    return recusar(
      modais.travou
        ? `Cliquei em Avançar e o GERID abriu um modal que eu não sei tratar: ${modais.travou}. ` +
          'Resolva na tela e me diga o que apareceu para eu passar a reconhecer.'
        : 'Cliquei em Avançar mas nenhum modal de confirmação apareceu. Confirme na tela.',
    );
  }
  console.log('[P10] confirmado no modal');

  // Protocolar é ida ao servidor do INSS: dar 60s aqui é mais barato do que
  // reportar falha num requerimento que na verdade entrou.
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    const agora = lerComprovante();
    if (agora.protocolo && agora.protocolo !== protocoloAntes) return agora;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // O GERID já avisou POR ESCRITO o que falta. Repetir a frase dele é melhor do
  // que a nossa suposição: o operador lê a exigência real em vez de "deu ruim".
  if (modais.agendamento) {
    return recusar(
      'O GERID exigiu o agendamento antes de finalizar: "' + modais.agendamento + '". ' +
      'Confirmei o aviso, mas o número do protocolo não saiu — o agendamento precisa ser feito na tela.',
    );
  }

  return recusar(
    'Confirmei o envio, mas o GERID não mostrou o número do protocolo em 60s. ' +
    (modais.ciente ? `O aviso que confirmei dizia: "${modais.ciente}". ` : '') +
    // Um modal que continuou na tela explica os 60s de espera inteiros. Antes
    // essa informação existia só dentro do laço e morria ali.
    (modais.travou ? `Ficou um modal que eu não sei tratar: ${modais.travou}. ` : '') +
    'NÃO refaça o requerimento sem antes conferir na lista se ele já foi protocolado.',
  );
}

/**
 * Confirma os modais do envio — e SÓ os que o próprio envio abre.
 *
 * São dois, com assinaturas bem diferentes:
 *
 * 1. **"Atenção"**, com o par Cancelar/Confirmar. É a confirmação final.
 * 2. **"Aviso"**, com um único botão Confirmar e o texto "Seu requerimento
 *    ainda não foi finalizado. Você precisa realizar o agendamento de Avaliação
 *    Social…". É um ciente: sem clicar nele o envio não anda.
 * 3. **Qualquer outro ciente de botão único** — o INSS acrescenta aviso novo
 *    sem avisar ninguém (o de biometria apareceu em 08/2026). Modal com um
 *    único botão rotulado não oferece escolha, então confirmar é a única saída.
 *
 * ⚠️ Existe um TERCEIRO modal no GERID que também tem um botão "Confirmar": o
 * "Você criou uma tarefa, protocolo …, para este interessado recentemente.
 * Deseja visualizar esta tarefa?". Confirmar ALI abandona o requerimento que
 * acabamos de preencher inteiro. Por isso cada modal é reconhecido pelo TEXTO
 * dele, nunca por "algum botão chamado Confirmar" — o terceiro não casa com
 * nenhuma das duas assinaturas e o robô passa por ele sem tocar.
 */
async function confirmarModaisDoEnvio(
  page: Page,
): Promise<{ confirmou: boolean; agendamento: string; ciente: string; travou: string }> {
  const limite = Date.now() + 20_000;
  let confirmou = false;
  let agendamento = '';
  let ciente = '';
  // O modal que ficou na tela sem o robo saber o que fazer com ele. Guardado
  // para a mensagem de erro: sem isto o operador so via "o protocolo nao saiu".
  let travou = '';

  while (Date.now() < limite) {
    // A DECISAO mora em `decidirModalDoEnvio`, que nao clica em nada; o clique
    // e daqui. Separado assim a regra pode ser testada com modal de verdade na
    // tela, sem que o teste dispare o clique que, na tela errada, abandonaria um
    // requerimento inteiro.
    const achado = await page.evaluate(() => {
      const decisao = decidirModalDoEnvio(document);
      if (decisao.tipo && decisao.confirmar) decisao.confirmar.click();
      return {
        tipo: decisao.tipo,
        texto: decisao.texto,
        algumDialogo: decisao.algumDialogo,
        naoReconhecido: decisao.naoReconhecido,
      };
    });

    if (achado.naoReconhecido) travou = achado.naoReconhecido;

    if (achado.tipo === 'atencao') confirmou = true;
    if (achado.tipo === 'agendamento') {
      confirmou = true;
      agendamento = achado.texto;
    }
    if (achado.tipo === 'ciente') {
      confirmou = true;
      // O texto NÃO é engolido: "é necessário realizar o cadastro biométrico"
      // é uma exigência que alguém vai ter que cumprir em 30 dias. Confirmar o
      // ciente sem repetir a frase esconderia isso de quem opera.
      ciente = achado.texto;
    }
    if (achado.tipo) console.log('[P10] modal confirmado:', achado.tipo, '—', achado.texto);
    if (achado.naoReconhecido) console.log('[P10] modal NAO reconhecido:', achado.naoReconhecido);

    // Já confirmei e a tela ficou sem modal: acabou, não há o que esperar.
    if (confirmou && !achado.tipo && !achado.algumDialogo) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { confirmou, agendamento, ciente, travou };
}

/**
 * Lê a tela do comprovante: o número do protocolo e o texto para arquivar.
 *
 * `detectarProtocoloEmTexto` só aceita número PRECEDIDO de rótulo ("protocolo",
 * "requerimento:"), justamente para não confundir CPF, CEP ou qualquer número
 * solto com um protocolo — um número inventado aqui viraria comprovante falso
 * na pasta do cliente.
 */
function lerComprovante(): { protocolo: string; comprovante: string } {
  const texto = (document.body?.innerText || '').replace(/\u00a0/g, ' ');
  return {
    // A tela de detalhe da tarefa vem primeiro porque ali o n\u00famero est\u00e1 num
    // campo rotulado \u2014 \u00e9 leitura exata, n\u00e3o reconhecimento de frase.
    protocolo: protocoloNaTelaDeTarefa(document) || detectarProtocoloEmTexto(texto) || '',
    // Recorta a partir do título "Comprovante" para não arquivar o menu do
    // portal junto; sem o título, guarda a tela toda em vez de perder o dado.
    comprovante: (texto.split(/^\s*Comprovante\s*$/m)[1] || texto).trim().slice(0, 8_000),
  };
}

// ---------------------------------------------------------------------------
// Helpers — todos conscientes de que a SPA não limpa o DOM
// ---------------------------------------------------------------------------

/**
 * Só o elemento VISÍVEL interessa. O GERID mantém no HTML tudo o que já foi
 * renderizado nas etapas anteriores: sem este filtro, `getByRole` e
 * `getByText` casam em nós de telas passadas (e o strict mode do Playwright
 * estoura com "resolved to N elements").
 */
function visivel(loc: Locator): Locator {
  // O polyfill da extensão já espera e interage apenas com elementos visíveis.
  return loc;
}

async function existeInputNoDom(loc: Locator): Promise<boolean> {
  return (await loc.getAttribute('id').catch(() => null)) !== null;
}

async function estaAnexado(loc: Locator): Promise<boolean> {
  const verificar = (loc as Locator & { isAttached?: () => Promise<boolean> }).isAttached;
  return verificar ? verificar.call(loc) : existeInputNoDom(loc);
}

async function contarAnexados(loc: Locator): Promise<number> {
  const contar = (loc as Locator & { countAttached?: () => Promise<number> }).countAttached;
  return contar ? contar.call(loc) : loc.count();
}

/**
 * O GERID é uma SPA: o Avançar de cada passo dispara uma chamada de API antes
 * de trocar de tela. Quando essa chamada morre na rede (ERR_NAME_NOT_RESOLVED
 * no `atendimento.inss.gov.br`, o que acontece quando a VPN oscila ou o cache
 * de DNS do Chrome envelhece), a tela simplesmente não muda — e o sintoma é
 * idêntico ao de um campo mal preenchido.
 *
 * Aqui não se conclui nada: pergunta-se à rede. Uma resposta qualquer, até
 * 404, prova que o nome resolveu e que o problema é o preenchimento. Só a
 * rejeição vira evidência, e mesmo assim ela é ANEXADA ao erro original em vez
 * de substituí-lo — o CSP da página também pode recusar esta sondagem, e trocar
 * um diagnóstico certo por um chute mandaria o operador mexer na VPN à toa.
 */
async function evidenciaDeRedeCaida(): Promise<string> {
  try {
    await fetch(`${location.origin}/favicon.ico?rpa=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return '';
  } catch {
    return (
      ` Também não consegui alcançar ${location.host} agora — confira a VPN e limpe o cache do`
      + ' navegador antes de suspeitar do preenchimento.'
    );
  }
}

/** Avança usando o id estável — nunca por texto, que existe várias vezes. */
async function avancar(page: Page, etapaAtual: EtapaGerid): Promise<void> {
  const antes = detectarEstadoGerid();
  if (antes.etapa !== etapaAtual) {
    const contexto = resumirDiagnosticoGerid(capturarDiagnosticoGerid());
    throw new ErroGerid(
      FalhaGerid.CAMPO_NAO_ENCONTRADO,
      `A extensão esperava ${etapaAtual}, mas o GERID estava em ${antes.etapa}. ${contexto}`,
    );
  }

  const botao = visivel(page.locator(NAVEGACAO.avancar)).first();
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    if (await botao.isEnabled().catch(() => false)) {
      await botao.click();
      const limiteMudanca = Date.now() + 10_000;
      while (Date.now() < limiteMudanca) {
        const depois = detectarEstadoGerid();
        if (depois.etapa !== etapaAtual && depois.etapa !== 'desconhecido') {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const contexto = resumirDiagnosticoGerid(capturarDiagnosticoGerid());
  const rede = await evidenciaDeRedeCaida();
  throw new ErroGerid(
    FalhaGerid.ERRO_PREENCHIMENTO,
    `O GERID não saiu de ${etapaAtual} após validar os dados. ${contexto}${rede}`,
  );
}

/** Confirma que estamos no passo certo antes de preencher. */
async function esperarTela(page: Page, marca: RegExp): Promise<void> {
  try {
    await visivel(page.getByText(marca)).first().waitFor({ state: 'visible' });
  } catch {
    throw new ErroGerid(
      FalhaGerid.CAMPO_NAO_ENCONTRADO,
      `Não encontrei a tela esperada (${marca}). O layout do GERID pode ter mudado — revalidar o mapeamento.`,
    );
  }
}

async function garantirMarcado(loc: Locator): Promise<void> {
  const id = await loc.getAttribute('id').catch(() => null);
  if (id && await acionarControleReactNaPagina('marcar', id)) {
    const limite = Date.now() + 1_000;
    while (Date.now() < limite) {
      if (await loc.isChecked().catch(() => false)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  // O `<input>` do br-tag tem opacity:0 e 0x0 — quem carrega o handler é a
  // `span.interaction-select` em volta. Clique real nela funciona (verificado
  // no DOM do passo 4); agir sobre o input não marca nada.
  if (id && !(await loc.isChecked().catch(() => false))) {
    const tag = document.getElementById(id)?.closest<HTMLElement>('.interaction-select');
    if (tag) {
      for (const tipo of ['mousedown', 'mouseup', 'click']) {
        tag.dispatchEvent(new MouseEvent(tipo, {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: 0,
          view: window,
        }));
      }
      const limite = Date.now() + 1_000;
      while (Date.now() < limite) {
        if (await loc.isChecked().catch(() => false)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }

  if (!(await loc.isChecked().catch(() => false))) {
    await loc.check({ force: true });
  }
}

async function acionarControleReactNaPagina(
  tipo: 'combobox' | 'marcar',
  id: string,
  valor?: string,
): Promise<boolean> {
  if (acionarControleReactLocal(tipo, id, valor)) return true;

  try {
    const resposta = await chrome.runtime.sendMessage({
      action: 'gerid_react_control',
      tipo,
      id,
      valor,
    });
    return resposta?.ok === true;
  } catch {}

  return acionarControleReactViaEvento(tipo, id, valor);
}

async function acionarControleReactViaEvento(
  tipo: 'combobox' | 'marcar',
  id: string,
  valor?: string,
): Promise<boolean> {
  if (!document.documentElement.dataset.geridRpaControlBridge) return false;

  const canal = '__gerid_rpa_control__';
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    let encerrado = false;
    const finalizar = (resultado: boolean) => {
      if (encerrado) return;
      encerrado = true;
      window.removeEventListener('message', receberResposta);
      resolve(resultado);
    };
    const receberResposta = (evento: MessageEvent) => {
      if (evento.source !== window || evento.data?.canal !== canal) return;
      if (evento.data?.tipoMensagem !== 'resposta' || evento.data?.requestId !== requestId) return;
      finalizar(evento.data.resposta?.ok === true);
    };

    window.addEventListener('message', receberResposta);
    window.postMessage({
      canal,
      tipoMensagem: 'solicitacao',
      requestId,
      tipoControle: tipo,
      id,
      valor,
    }, '*');
    setTimeout(() => finalizar(false), 3_000);
  });
}

function acionarControleReactLocal(
  tipo: 'combobox' | 'marcar',
  id: string,
  valor?: string,
): boolean {
  const obterPropsReact = (elemento: Element | null): Record<string, any> | null => {
    if (!elemento) return null;
    const nomes = Object.getOwnPropertyNames(elemento);
    const chaveProps = nomes.find((nome) => nome.startsWith('__reactProps$'));
    if (chaveProps) return (elemento as any)[chaveProps];

    // React tambem mantem as props atuais no Fiber. Este caminho cobre builds
    // em que __reactProps$ nao aparece como propriedade enumeravel do no.
    const chaveFiber = nomes.find((nome) => nome.startsWith('__reactFiber$'));
    let fiber = chaveFiber ? (elemento as any)[chaveFiber] : null;
    for (let nivel = 0; fiber && nivel < 4; nivel++, fiber = fiber.return) {
      if (fiber.memoizedProps) return fiber.memoizedProps;
    }
    return null;
  };

  const criarEvento = (elemento: Element, tipoEvento: string, value?: string) => {
    let cancelado = false;
    return {
      type: tipoEvento,
      target: value === undefined ? elemento : { value },
      currentTarget: elemento,
      nativeEvent: null,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() { cancelado = true; },
      stopPropagation() {},
      persist() {},
      isDefaultPrevented() { return cancelado; },
      isPropagationStopped() { return false; },
    };
  };

  const opcaoCorresponde = (item: HTMLElement, alvo: string): boolean => {
    const label = item.querySelector<HTMLLabelElement>('label');
    const textos = [
      label?.querySelector<HTMLElement>('[aria-hidden="true"] > div')?.textContent,
      label?.querySelector<HTMLElement>('div')?.textContent,
      label?.getAttribute('aria-label'),
      label?.innerText,
      label?.textContent,
    ].filter((texto): texto is string => Boolean(texto?.trim()));

    // O Select do GERID repete o rotulo em um span visual e outro sr-only.
    // startsWith cobre esse texto duplicado e o hint "Atendimento a distancia".
    return textos.some((texto) => {
      const candidato = normalizar(texto);
      return candidato === alvo || candidato.startsWith(alvo);
    });
  };

  if (tipo === 'combobox') {
    const combo = document.getElementById(id) as HTMLInputElement | null;
    const lista = document.getElementById(`${id}-itens`);
    const alvo = normalizar(valor ?? '');
    const item = Array.from(lista?.querySelectorAll<HTMLElement>('.br-item') ?? [])
      .find((opcao) => opcaoCorresponde(opcao, alvo));
    if (!combo || !item) return false;

    // Contrato real do componente Sw publicado pelo GERID: o onChange do
    // input recebe o value interno (1=Solteiro, 2=Casado etc.), localiza o
    // objeto da opcao e repassa esse objeto ao formulario/Redux.
    const valorOpcao = item.querySelector<HTMLInputElement>('input[type="radio"]')?.value;
    const propsCombo = obterPropsReact(combo);
    if (valorOpcao && typeof propsCombo?.onChange === 'function') {
      try {
        propsCombo.onChange(criarEvento(combo, 'change', valorOpcao));
        return true;
      } catch {}
    }

    const props = obterPropsReact(item);

    if (typeof props?.onMouseDown === 'function') {
      props.onMouseDown(criarEvento(item, 'mousedown'));
      return true;
    }
    if (typeof props?.onKeyDown === 'function') {
      props.onKeyDown({ ...criarEvento(item, 'keydown'), key: 'Enter' });
      return true;
    }
    return false;
  }

  const controle = document.getElementById(id)?.closest<HTMLElement>('.interaction-select');
  const props = obterPropsReact(controle ?? null);
  if (!controle || !props) return false;

  if (typeof props.onClick === 'function') {
    props.onClick(criarEvento(controle, 'click'));
    return true;
  }
  if (typeof props.onKeyDown === 'function') {
    props.onKeyDown({ ...criarEvento(controle, 'keydown'), key: 'Enter' });
    return true;
  }
  return false;
}

/** Ativa os itens do Select oficial, que confirma a escolha em onMouseDown. */
async function ativarOpcaoCombobox(opcao: Locator): Promise<void> {
  // O polyfill reproduz mousedown, mouseup e click. O GERID confirma a opcao
  // no mousedown; a sequencia completa evita deixar o estado React incompleto.
  await opcao.click();
}

/**
 * Escolhe uma opção num combobox customizado do GERID.
 *
 * Não é `<select>`: é `<input role="combobox">` com as opções em radios dentro
 * de `{id}-itens`. O escopo no container é obrigatório porque os ids das
 * opções se repetem entre dropdowns (radio `1` = "Solteiro" no estado civil e
 * "Cônjuge" no parentesco).
 *
 * Devolve false em vez de lançar: quem chama decide se vira aviso ou erro.
 */
/**
 * Instrumentação temporária do passo 4. O robô falhava sem dizer QUAL ramo
 * desarmou, e o erro final ("não saiu de passo_4") só mostrava a consequência.
 * Cada saída de `escolherNoCombobox` passa por aqui com o estado real do DOM.
 */
function diagCombobox(id: string, alvo: string, motivo: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const lista = document.getElementById(`${id}-itens`);
  const estilo = el ? window.getComputedStyle(el) : null;
  console.log(
    `[P4][combo] ${id} alvo="${alvo}" motivo=${motivo}` +
      ` existe=${Boolean(el)} rects=${el?.getClientRects().length ?? -1}` +
      ` display=${estilo?.display} visibility=${estilo?.visibility}` +
      ` value="${el?.value ?? ''}"` +
      ` itens=${lista ? lista.querySelectorAll('.br-item').length : 'sem-lista'}`,
  );
}

/**
 * O rótulo sem o sufixo de gênero.
 *
 * O GERID escreve o MESMO valor de dois jeitos conforme a tela: a etapa 4
 * grava "Solteiro" e a etapa 7 pede "Solteiro(a)". Comparar cru dá falso
 * negativo. Só o parêntese sai — "C) Não" não tem "(", então não é tocado, e
 * "B) Não" continua diferente de "Não".
 */
function semSufixoDeGenero(texto: string): string {
  return texto.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Se o combo já carrega o valor que queremos. Lê o DOM, não a nossa intenção. */
function jaTemValor(id: string, alvo: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const atual = normalizar(el?.value ?? '');
  if (!atual) return false;
  return atual === alvo || semSufixoDeGenero(atual) === semSufixoDeGenero(alvo);
}

async function escolherNoCombobox(
  page: Page,
  idCombobox: string,
  rotuloDesejado: string,
  aceitarTextoAdicional = false,
): Promise<boolean> {
  const idNoSeletor = idCombobox.match(/\[id="([^"]+)"\]/)?.[1];
  const id = idNoSeletor ?? idCombobox.replace(/^#/, '');
  const combo = page.locator(`[id="${id}"]`);
  const alvo = normalizar(rotuloDesejado);

  if (!(await combo.isVisible().catch(() => false))) {
    /**
     * Invisível NÃO quer dizer que faltou preencher.
     *
     * Combo de etapa anterior continua no DOM, só escondido. O Estado Civil é
     * o caso: a etapa 4 marcou "Solteiro" e registrou sucesso; na etapa 7 a
     * varredura reencontrava o MESMO `selectEstadoCivil0`, agora `rects=0`,
     * não conseguia clicar num elemento sem área — e isso virava pendência.
     * Resultado: o robô preenchia o requerimento inteiro, chegava no
     * "Avançar" e se recusava a protocolar por um campo que estava certo.
     *
     * Então, antes de desistir, lemos o que está gravado. Se já é o alvo,
     * acabou — não é o robô "achando" que deu certo, é o DOM dizendo.
     */
    if (jaTemValor(id, alvo)) {
      diagCombobox(id, rotuloDesejado, 'ok_ja_preenchido_em_etapa_anterior');
      return true;
    }
    diagCombobox(id, rotuloDesejado, 'combo_nao_visivel');
    return false;
  }

  // As opcoes continuam anexadas ao DOM mesmo com a lista recolhida.
  //
  // ⚠️ ORDEM INVERTIDA DE PROPÓSITO — o clique real vem primeiro.
  //
  // O atalho pelas props do React escreve o TEXTO no input, e a confirmação
  // relia esse mesmo texto: é circular, e passa mesmo quando a SELEÇÃO nunca
  // foi registrada. O modal de Contatos expôs isso — o combo exibia "Celular",
  // mas o GERID manteve `valorContatoInteressado` com `disabled`, porque para
  // ele nada tinha sido escolhido. Clicar na opção não tem como dessincronizar
  // o React, então é ele quem manda; o atalho fica como último recurso.
  const rotulos = page.locator(`[id="${id}-itens"] label`);

  // ⚠️ Combo que busca no servidor (Município, Bairro, Unidade) nasce com a
  // lista contendo SÓ o item "Limpar" e recebe as opções depois. O código antigo
  // só esperava quando `total === 0`; com 1 item ele lia "Limpar", não casava e
  // desistia na hora — foi assim que o passo 9 morreu em 0,0s com
  // "nenhum_rotulo_casou (total=1)" enquanto "EXTREMOZ" aparecia na tela logo
  // em seguida. Agora a varredura inteira se repete enquanto a lista pode crescer.
  const limiteBusca = Date.now() + 12_000;
  let total = 0;
  let totalAnterior = -1;
  let estavel = 0;
  let ultimoClique = 0;
  for (;;) {
  total = await rotulos.count().catch(() => 0);

  // ⚠️ Contar rótulos NÃO é o mesmo que conseguir lê-los. O dropdown fechado do
  // GERID mantém as opções no DOM, então `total` já vem 2, 3, 11 — mas dentro
  // de um container `hidden`, e `innerText` de elemento invisível é string
  // vazia. Com a regra antiga ("só reabre se total <= 1") o robô nunca clicava
  // para abrir, lia vazio em tudo e desistia com "nenhum_rotulo_casou" — e o
  // passo 4 do grupo familiar é justamente onde os combos nascem fechados.
  // Por isso o gatilho é: ninguém legível na lista.
  const legiveis = await page.evaluate(
    (seletor: string) => Array.from(document.querySelectorAll<HTMLElement>(seletor))
      .filter((elemento) => (elemento.innerText || '').trim().length > 0).length,
    `[id="${id}-itens"] label`,
  ).catch(() => 0);

  // Clicar de novo com a lista JÁ legível recolheria o dropdown no meio da
  // varredura. `total <= 1` continua valendo para o combo que busca no servidor
  // e fica só com "Limpar" na tela.
  if ((legiveis === 0 || total <= 1) && Date.now() - ultimoClique > 2_000) {
    ultimoClique = Date.now();
    await combo.click().catch(() => undefined);
  }

  for (let i = 0; i < total; i++) {
    const rotulo = rotulos.nth(i);

    // O rótulo é lido DENTRO do container, nunca por document-wide `label[for]`:
    // os ids se repetem e a busca global devolveria o rótulo do outro dropdown.
    const texto = await rotulo.innerText().catch(() => '');

    // ⚠️ O item do Design System gov.br guarda o rótulo DUAS vezes: um
    // `<span aria-hidden="true">` para quem enxerga e um `<span class="sr-only">`
    // para o leitor de tela. `innerText` devolve os dois — "Solteiro\nSolteiro" —
    // e a comparação exata nunca batia. O robô então só acertava pelo último
    // recurso (chamar o onChange do React na marra), que é justamente o caminho
    // que não prova que o GERID registrou a escolha. Cada linha vale como
    // candidata; nenhuma delas é texto inventado, todas saem do próprio rótulo.
    const candidatos = [texto, ...texto.split('\n')]
      .map((parte) => normalizar(parte))
      .filter(Boolean);
    const casou = candidatos.some((candidato) =>
      candidato === alvo || (aceitarTextoAdicional && candidato.includes(alvo)));
    if (casou) {
      await ativarOpcaoCombobox(rotulo).catch(() => undefined);
      if (await aguardarValorCombobox(combo, alvo, 1_000)) {
        diagCombobox(id, rotuloDesejado, 'ok_clique_no_item');
        return true;
      }

      const rid = await rotulo.getAttribute('for');
      if (rid) {
        const radio = page
          .locator(`[id="${id}-itens"] input[id="${cssEscape(rid)}"]`)
          .first();
        await radio.check({ force: true }).catch(() => undefined);
        if (await aguardarValorCombobox(combo, alvo, 1_000)) {
          diagCombobox(id, rotuloDesejado, 'ok_radio');
          return true;
        }
        // O radio interno pode ficar marcado por alguns milissegundos sem o
        // React aceitar a opcao. So o valor visivel confirma a selecao.
      }

      // Último recurso. Só chega aqui se o clique real não pegou, e o valor
      // que ele produz pode ser só texto — por isso quem chama ainda precisa
      // conferir um sinal do próprio GERID (ex.: o campo Valor habilitar).
      if (await acionarControleReactNaPagina('combobox', id, rotuloDesejado)) {
        if (await aguardarValorCombobox(combo, alvo, 1_500)) {
          diagCombobox(id, rotuloDesejado, 'ok_react_ultimo_recurso');
          return true;
        }
      }

      diagCombobox(id, rotuloDesejado, `opcao_achada_mas_valor_nao_grudou (for=${rid})`);
      return false;
    }
  }

    // Desistir cedo quando a lista JÁ carregou e ficou parada: aí "não casou"
    // é resposta final, e insistir 12s em cada combo comum custaria minutos por
    // requerimento. A espera longa é só para a lista que ainda não chegou.
    // `legiveis > 0` é parte da condição pelo mesmo motivo do clique acima: com
    // o dropdown fechado a contagem estabiliza na hora (as opções já estão no
    // DOM), e sem essa guarda o robô desistia em 450ms de uma lista que ele
    // nunca chegou a abrir.
    if (total > 1 && legiveis > 0 && total === totalAnterior && ++estavel >= 3) break;
    if (total !== totalAnterior) estavel = 0;
    totalAnterior = total;
    if (Date.now() >= limiteBusca) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  diagCombobox(id, rotuloDesejado, `nenhum_rotulo_casou (total=${total})`);
  return false;
}

async function aguardarValorCombobox(
  combo: Locator,
  valorEsperado: string,
  timeoutMs: number,
): Promise<boolean> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (normalizar(await combo.inputValue().catch(() => '')) === valorEsperado) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

function cssEscape(valor: string): string {
  return valor.replace(/["\\]/g, '\\$&');
}

/**
 * Localiza o id do campo de uma pergunta do passo 7 pelo TEXTO dela.
 *
 * Os ids ali são hash (`ca-<md5>`) — id gerado não é contrato, então o robô
 * ancora no texto. Duas estratégias, nesta ordem:
 *
 *  1. O contrato real do GERID: cada pergunta é um `<div id="div-ca-...">` com
 *     o `<label>` da pergunta e o campo dentro. É exato e não depende de layout.
 *  2. Subir a partir do campo procurando um bloco que contenha a pergunta —
 *     rede de segurança para telas montadas de outro jeito.
 *
 * `textContent` entra junto com `innerText` de propósito: `innerText` devolve
 * vazio quando o elemento não está sendo renderizado (atrás de um modal, por
 * exemplo) e a pergunta continuaria lá, escrita, invisível para o robô.
 */
async function campoPorPergunta(
  page: Page,
  trechoPergunta: string,
  querCombobox: boolean,
  esperaMs = 2_500,
): Promise<string | null> {
  // ⚠️ Uma varredura só era cedo demais. O passo 7 remonta as perguntas depois
  // que a janela de Contatos fecha, e uma leitura feita nesse intervalo devolve
  // "não encontrei" para TODAS elas de uma vez — foi o que aconteceu no build
  // .18, com as 7 perguntas obrigatórias reportadas como ausentes enquanto
  // `div-ca-...` estava na tela segundos depois. Aqui a busca se repete.
  const limite = Date.now() + esperaMs;
  for (;;) {
    const achado = await buscarCampoPorPergunta(page, trechoPergunta, querCombobox);
    if (achado || Date.now() >= limite) return achado;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function buscarCampoPorPergunta(
  page: Page,
  trechoPergunta: string,
  querCombobox: boolean,
): Promise<string | null> {
  return page.evaluate(({ trecho, combobox }: { trecho: string; combobox: boolean }) => {
    const norm = (s: string) =>
      (s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const ler = (el: HTMLElement) => norm(el.innerText || el.textContent || '');
    const alvo = norm(trecho);
    if (!alvo) return null;

    const naoTexto = ['file', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
    const serve = (input: HTMLInputElement) => (combobox
      ? input.getAttribute('role') === 'combobox'
      : input.getAttribute('role') !== 'combobox' && !naoTexto.includes(input.type));

    for (const bloco of Array.from(document.querySelectorAll<HTMLElement>('[id^="div-ca-"]'))) {
      // ⚠️ Todos os rótulos do bloco, não só o primeiro. Quando o GERID pendura
      // um campo condicional DENTRO do bloco da pergunta que o controla, o
      // `querySelector('label')` devolvia sempre o rótulo da pergunta e o campo
      // filho ficava invisível para a busca — foi assim que o "CPF do
      // Procurador" sumiu enquanto o próprio GERID cobrava ele.
      const rotulos = Array.from(bloco.querySelectorAll('label'));
      const casado = rotulos.find((rotulo) => ler(rotulo).includes(alvo));
      if (!casado) continue;
      // `for=` é o vínculo declarado pelo GERID: quando existe, é ele que manda.
      const porFor = casado.getAttribute('for');
      const apontado = porFor ? document.getElementById(porFor) : null;
      if (apontado instanceof HTMLInputElement && serve(apontado)) return apontado.id;
      const input = Array.from(bloco.querySelectorAll<HTMLInputElement>('input')).find(serve);
      if (input?.id) return input.id;
    }

    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input'))) {
      if (!input.id || !serve(input)) continue;
      let p: HTMLElement | null = input.parentElement;
      for (let h = 0; p && h < 6; h++, p = p.parentElement) {
        const texto = ler(p);
        if (texto.length > 3 && texto.length < 400 && texto.includes(alvo)) return input.id;
      }
    }
    return null;
  }, { trecho: trechoPergunta, combobox: querCombobox });
}

const comboPorPergunta = (page: Page, trechoPergunta: string, esperaMs?: number) =>
  campoPorPergunta(page, trechoPergunta, true, esperaMs);

/**
 * Espera o bloco de perguntas do GERID parar de se remontar.
 *
 * As perguntas são `div-ca-<hash>` criadas pelo React. Enquanto a janela de
 * Contatos fecha, esse conjunto muda de tamanho; ler no meio disso devolve
 * "pergunta não encontrada" para todas. Espera-se a CONTAGEM ficar parada, e
 * não um seletor específico — assim vale para qualquer passo.
 */
async function esperarPerguntasEstaveis(page: Page, esperaMs = 10_000): Promise<number> {
  const contar = () => page.evaluate(() =>
    document.querySelectorAll('[id^="div-ca-"] input[role="combobox"]').length);
  const limite = Date.now() + esperaMs;
  let anterior = -1;
  let estavel = 0;
  let total = 0;
  for (;;) {
    total = await contar().catch(() => 0);
    if (total > 0 && total === anterior && ++estavel >= 3) break;
    if (total !== anterior) estavel = 0;
    anterior = total;
    if (Date.now() >= limite) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  console.log(`[P7] perguntas estaveis: ${total} combo(s)`);
  return total;
}

/** Localiza um input de texto sem rótulo `for`, usando a pergunta ao redor. */
const inputPorPergunta = (page: Page, trechoPergunta: string) =>
  campoPorPergunta(page, trechoPergunta, false);

/**
 * Acha o campo do CPF do procurador sem depender de um rótulo exato.
 *
 * O campo só nasce depois de "Deseja cadastrar Procurador?" = Sim, e o GERID
 * escreve o rótulo de jeitos diferentes. Tenta as variações conhecidas e, se
 * nenhuma casar, procura um campo que peça CPF dentro de um bloco que fale de
 * procurador. Nada aqui inventa seletor: tudo ancora no texto da tela.
 */
async function campoCpfProcurador(page: Page, esperaMs = 8000): Promise<string | null> {
  const procurar = async (): Promise<string | null> => {
  for (const rotulo of ['CPF do Procurador', 'CPF Procurador', 'CPF do(a) Procurador']) {
    const id = await inputPorPergunta(page, rotulo);
    if (id) return id;
  }

  const generico = await page.evaluate(() => {
    const norm = (s: string) =>
      (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const ler = (el: Element) => norm((el as HTMLElement).innerText || el.textContent || '');
    const naoTexto = ['file', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
    // Quem NÃO pode ser confundido com o procurador. Preencher o CPF do
    // advogado no campo do requerente trocaria as pessoas do requerimento.
    const outroDono = ['requerente', 'interessado', 'titular', 'representante legal'];

    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input'))) {
      if (!input.id || input.disabled || input.getAttribute('role') === 'combobox') continue;
      if (naoTexto.includes(input.type)) continue;
      const proprio = norm([
        document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent || '',
        input.getAttribute('aria-label') || '',
        input.getAttribute('placeholder') || '',
        input.name || '',
      ].join(' '));
      if (!proprio.includes('cpf')) continue;
      if (outroDono.some((dono) => proprio.includes(dono))) continue;

      let bloco: HTMLElement | null = input.parentElement;
      for (let altura = 0; bloco && altura < 6; altura++, bloco = bloco.parentElement) {
        if (ler(bloco).includes('procurador')) return input.id;
      }
    }
    return null;
  });
  if (generico) return generico;

  // Ultima tentativa, restrita ao bloco da pergunta do procurador. Fora dele um
  // rotulo curto como "CPF" nao diz de quem e o campo, e adivinhar ali seria
  // digitar o CPF do advogado no lugar de outra pessoa. Dentro do bloco que
  // pergunta pelo procurador, o dono ja esta determinado pelo contexto.
  return page.evaluate(() => {
    const norm = (s: string) =>
      (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const ler = (el: Element | null) =>
      el ? norm((el as HTMLElement).innerText || el.textContent || '') : '';
    const naoTexto = ['file', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
    const identidade = (input: HTMLInputElement) => norm([
      document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent || '',
      input.getAttribute('aria-label') || '',
      input.getAttribute('placeholder') || '',
      input.name || '',
    ].join(' '));

    for (const bloco of Array.from(document.querySelectorAll<HTMLElement>('[id^="div-ca-"]'))) {
      if (!ler(bloco.querySelector('label')).includes('procurador')) continue;
      const candidatos = Array.from(bloco.querySelectorAll<HTMLInputElement>('input'))
        .filter((input) => input.id && !input.disabled && !input.readOnly &&
          input.getAttribute('role') !== 'combobox' &&
          !naoTexto.includes(input.type) &&
          input.getClientRects().length > 0);
      const porNome = candidatos.find((input) => identidade(input).includes('cpf'));
      if (porNome) return porNome.id;
      // Sem rotulo proprio, so aceita se o bloco fala em CPF e ha UM unico campo
      // digitavel nele. Dois candidatos e ambiguidade, e ambiguidade aqui
      // significaria escrever o CPF num campo que pede outra coisa.
      if (candidatos.length === 1 && ler(bloco).includes('cpf')) return candidatos[0]!.id;
    }
    return null;
  });
  };

  // ⚠️ O campo é montado pelo React DEPOIS que "Deseja cadastrar Procurador?"
  // vira "Sim", e a montagem não é instantânea. Uma busca única lia a tela
  // antes da re-renderização: no build .9 o log deu "campo nao encontrado" com
  // a pergunta já respondida com "Sim", e no Avançar o GERID cobrou "O campo
  // adicional 'CPF do Procurador' deve ser preenchido". Aqui se espera o campo
  // nascer em vez de concluir que ele não existe.
  const limite = Date.now() + esperaMs;
  for (;;) {
    const id = await procurar();
    if (id) return id;
    if (Date.now() >= limite) return null;
    await new Promise((resolva) => setTimeout(resolva, 250));
  }
}

/**
 * Descreve o que existe na tela sobre "procurador" quando o campo não aparece.
 *
 * Serve para consertar com prova em vez de chute: devolve rótulos, nunca
 * valores digitados — nenhum CPF sai daqui.
 */
async function pistasDoProcurador(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const norm = (s: string) =>
      (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const ler = (el: Element) => ((el as HTMLElement).innerText || el.textContent || '')
      .replace(/\s+/g, ' ').trim();
    const pistas = new Set<string>();

    // 1. O que a pergunta do procurador está respondendo AGORA. Se estiver
    //    vazia, o problema é outro: a resposta não pegou.
    for (const bloco of Array.from(document.querySelectorAll<HTMLElement>('[id^="div-ca-"]'))) {
      const rotulo = bloco.querySelector('label');
      if (!rotulo || !norm(ler(rotulo)).includes('deseja cadastrar procurador')) continue;
      const campos = Array.from(bloco.querySelectorAll('input'));
      const combo = campos.find((c) => c.getAttribute('role') === 'combobox');
      pistas.add(`resposta atual: "${combo?.value || '(vazio)'}"`);
      pistas.add(`campos no bloco da pergunta: ${campos.length}`);

      // Identidade de cada campo do bloco — e NENHUM valor digitado, só se está
      // vazio ou não. "4 campos" sozinho não disse se o campo do CPF existe e a
      // busca erra, ou se ele nem chega a ser montado; isto diz.
      for (const campo of campos) {
        if (campo === combo) continue;
        const marca = campo.id ? document.querySelector(`label[for="${CSS.escape(campo.id)}"]`) : null;
        const rotulo = marca ? ler(marca)
          : (campo.getAttribute('aria-label') || campo.getAttribute('placeholder') || '');
        pistas.add(
          `campo ${campo.type || 'text'}` +
          `${campo.getClientRects().length ? '' : ' OCULTO'}` +
          `${campo.maxLength > 0 ? ` max=${campo.maxLength}` : ''}` +
          ` "${rotulo.slice(0, 40)}" ${campo.value ? 'preenchido' : 'vazio'}`,
        );
      }
      for (const rotulo of Array.from(bloco.querySelectorAll('label')).slice(1)) {
        pistas.add(`rotulo interno: "${ler(rotulo).slice(0, 60)}"`);
      }
      console.log('[P7] bloco do procurador:', bloco.outerHTML.slice(0, 4_000));
    }

    // Todo campo adicional digitável e VAZIO da tela. É exatamente entre esses
    // que está o que o GERID chama de "o campo adicional X deve ser preenchido",
    // então se "CPF do Procurador" existe em outro bloco, ele aparece aqui.
    for (const bloco of Array.from(document.querySelectorAll<HTMLElement>('[id^="div-ca-"]'))) {
      const naoTexto = ['file', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
      const vazio = Array.from(bloco.querySelectorAll<HTMLInputElement>('input')).some((campo) =>
        campo.getAttribute('role') !== 'combobox' && !naoTexto.includes(campo.type) && !campo.value);
      if (!vazio) continue;
      pistas.add(`vazio em: "${ler(bloco.querySelector('label') || bloco).slice(0, 50)}"`);
    }

    // 2. Qualquer coisa que fale de procurador — inclusive célula de tabela.
    //    Só folhas, senão o pai repete o texto do filho.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.children.length > 2 || el.getClientRects().length === 0) continue;
      const texto = ler(el);
      if (!texto || texto.length > 90 || !norm(texto).includes('procurador')) continue;
      pistas.add(`${el.tagName.toLowerCase()}: "${texto.slice(0, 70)}"`);
    }

    // 3. Botões de incluir/buscar: se o procurador entra pela tabela de
    //    Interessados, é por um deles que se abre a janela.
    const acoes = 'button, a[role="button"], .br-button, [aria-label]';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(acoes))) {
      if (el.getClientRects().length === 0) continue;
      const nome = (ler(el) || el.getAttribute('aria-label') || '').trim();
      if (!nome || nome.length > 60) continue;
      if (/adicionar|incluir|novo|buscar|pesquisar|vincular|interessad/i.test(nome)) {
        pistas.add(`acao: "${nome.slice(0, 50)}"`);
      }
    }
    return Array.from(pistas).slice(0, 14);
  });
}

/**
 * Fecha os avisos que o GERID abre POR CIMA do passo 7 e congelam a tela.
 *
 * O mais comum é "Você criou uma tarefa deste serviço [...] recentemente.
 * Deseja visualizar esta tarefa?", que aparece quando o mesmo interessado já
 * tem pedido recente — exatamente o caso de quem está reprocessando. Enquanto
 * ele estiver aberto, nada da tela responde.
 *
 * Só fecha o que sabe reconhecer, e sempre pelo "Fechar": o "Confirmar" desse
 * aviso ABANDONA o requerimento em andamento e navega para a outra tarefa.
 * Aviso desconhecido fica na tela de propósito — pode ser recado do INSS.
 */
async function fecharAvisosSobrepostos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const norm = (s: string) =>
      (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const fechados: string[] = [];
    for (const modal of Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))) {
      if (modal.getClientRects().length === 0) continue;
      const texto = norm(modal.innerText || modal.textContent || '');

      // A janela de contatos é do próprio robô: quem abre e fecha é o passo 7.
      if (texto.includes('tipo de contato') || texto.includes('contatos')) continue;

      const conhecido = texto.includes('deseja visualizar esta tarefa')
        || texto.includes('cpf do requerente');
      if (!conhecido) continue;

      const fechar = Array.from(modal.querySelectorAll<HTMLButtonElement>('button'))
        .find((botao) => norm(botao.innerText || botao.textContent || '') === 'fechar');
      if (!fechar) continue;

      fechar.click();
      fechados.push(texto.slice(0, 120));
    }
    return fechados;
  });
}

/** Responde um combobox do passo 7 localizado pela pergunta. Vira aviso se falhar. */
async function responderPergunta(
  page: Page,
  trechoPergunta: string,
  resposta: string,
  avisos: string[],
  opcional = false
): Promise<void> {
  // Pergunta opcional pode simplesmente não existir nesta tela; esperar por ela
  // seria pagar o tempo de espera por uma ausência esperada.
  const id = await comboPorPergunta(page, trechoPergunta, opcional ? 400 : 2_500);
  if (!id) {
    if (!opcional) {
      avisos.push(`Não encontrei a pergunta "${trechoPergunta}" — responda manualmente.`);
    }
    return;
  }
  const ok = await escolherNoCombobox(page, id, resposta);
  if (!ok) {
    avisos.push(
      `Não consegui marcar "${resposta}" em "${trechoPergunta}" — confira antes de concluir.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Passo 1 — Selecionar Serviço
// ---------------------------------------------------------------------------

async function passo1SelecionarServico(page: Page): Promise<void> {
  await esperarTela(page, /Sele..o de Servi.os/i);

  // O serviço tem código numérico fixo do INSS — mais estável que digitar o
  // nome no combobox (que era o que o código antigo fazia).
  // O GERID só renderiza as opções depois que a lista do combobox é aberta.
  const busca = visivel(page.locator(mapaGerid.passo1.campoBusca)).first();
  await busca.waitFor({ state: 'visible' });
  const abrirLista = visivel(page.getByRole('button', { name: /^Exibir lista$/i })).first();
  if (await abrirLista.isVisible().catch(() => false)) await abrirLista.click();
  else await busca.click();

  const selecionou = await escolherNoCombobox(
    page,
    mapaGerid.passo1.campoBusca,
    SERVICO_BPC_PCD.rotulo,
    true,
  );
  if (selecionou) {
    await avancar(page, 'passo_1');
    return;
  }

  throw new ErroGerid(
    FalhaGerid.ERRO_PREENCHIMENTO,
    'O serviço BPC apareceu, mas o Gerid não confirmou a seleção no campo Serviço.',
  );
}

// ---------------------------------------------------------------------------
// Passo 2 — Informar Requerente
// ---------------------------------------------------------------------------

async function passo2InformarRequerente(page: Page, caso: CasoParaProtocolar): Promise<void> {
  const cpf = visivel(page.locator(mapaGerid.passo2.cpf)).first();
  await cpf.waitFor({ state: 'visible' }).catch(() => {
    throw new ErroGerid(
      FalhaGerid.CAMPO_NAO_ENCONTRADO,
      'Campo de CPF do requerente não apareceu no passo 2.',
    );
  });

  await cpf.fill(apenasDigitos(caso.cliente.cpf));

  const botaoConsulta = visivel(
    page.getByRole('button', { name: /Bot.o de a..o/i }),
  ).first();
  if (await botaoConsulta.isVisible().catch(() => false)) {
    await botaoConsulta.click();
  }

  // Confirmado no GERID real: o nome preenche sozinho ao digitar o CPF.
  // Não há lupa nem Enter (o `press('Enter')` do código antigo era inútil).
  // Espera o nome chegar antes de avançar — é a prova de que o CPF foi aceito.
  const nome = visivel(page.locator(mapaGerid.passo2.nome)).first();
  const inicioEspera = Date.now();
  while (Date.now() - inicioEspera < 10_000) {
    if ((await nome.inputValue().catch(() => '')).trim()) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!(await nome.inputValue().catch(() => '')).trim()) {
    throw new ErroGerid(
      FalhaGerid.CAMPO_NAO_ENCONTRADO,
      'O Gerid não retornou o nome do requerente após consultar o CPF.',
    );
  }

  await avancar(page, 'passo_2');
  verificarBloqueioDePedidoAberto();
}

/**
 * O GERID bloqueia um novo BPC quando o requerente ja possui pedido aberto.
 *
 * Le a PAGINA INTEIRA, ja sem acento, em vez de so `[role="alert"]`: a versao
 * antiga testava o texto cru contra `n..o e poss.vel`, que nunca casa com o que
 * o portal escreve de verdade ("Nao e possivel" com til e acento agudo), e
 * dependia de o aviso estar num container com esse papel. O numero vai NO TEXTO
 * do erro de proposito — e por ele que o resto do fluxo reconhece o caso como
 * ja protocolado, mesmo que o alerta suma da tela antes.
 */
function verificarBloqueioDePedidoAberto(): void {
  const numero = pedidoJaEmAberto();
  if (!numero) return;
  throw new ErroGerid(
    FalhaGerid.ERRO_PREENCHIMENTO,
    `O GERID bloqueou este requerente: o pedido ${numero} ainda esta em aberto. ` +
    'Nao refiz o requerimento.',
  );
}

// ---------------------------------------------------------------------------
// Passo 3 — Autorização CadÚnico
// ---------------------------------------------------------------------------

async function passo3AutorizacaoCadUnico(page: Page): Promise<void> {
  const check = visivel(page.locator(mapaGerid.passo3.autorizacaoCadUnico)).first();
  await check.waitFor({ state: 'visible' }).catch(() => {
    throw new ErroGerid(
      FalhaGerid.CAMPO_NAO_ENCONTRADO,
      'Checkbox de autorização do CadÚnico não apareceu no passo 3.',
    );
  });
  await garantirMarcado(check);
  await avancar(page, 'passo_3');
}

// ---------------------------------------------------------------------------
// Passo 4 — Grupo Familiar
// ---------------------------------------------------------------------------

/**
 * CPF em forma comparável: só dígitos, sempre com 11.
 *
 * O CadÚnico devolve o CPF ao GERID como NÚMERO, e número não guarda zero à
 * esquerda: `00258658541` chega na tela como `258658541`. A planilha guarda o
 * CPF como texto, com os zeros. São a mesma pessoa e davam duas chaves
 * diferentes.
 *
 * O estrago em 13/08/2026 (ANA LUCIA) foi exatamente esse: a mesma filha entrou
 * como "veio do CadÚnico mas não está na planilha" E como "está na planilha mas
 * o GERID não listou". Sem casar, o robô ficou sem o parentesco dela, marcou
 * "Outros" no chute, e as duas pendências pararam o protocolo para revisão
 * humana. Nenhuma divergência existia — era a comparação que estava errada.
 *
 * Preencher com zero é seguro porque o alvo tem tamanho fixo: 11 é o CPF
 * inteiro, e o que vier menor só pode ter perdido zero à esquerda pelo caminho.
 * O que já tem 11 (ou mais, num campo sujo) não é tocado.
 */
function chaveCpf(valor: string | undefined | null): string {
  const digitos = apenasDigitos(valor ?? '');
  return digitos && digitos.length < 11 ? digitos.padStart(11, '0') : digitos;
}

/**
 * O GERID já lista as pessoas (vindas do CadÚnico). O robô só marca parentesco
 * e estado civil, casando por CPF com a nossa planilha.
 *
 * Os comboboxes são INDEXADOS por linha (`selectParentesco{i}` /
 * `selectEstadoCivil{i}`). A ordem vem do CadÚnico e o requerente pode estar
 * em qualquer posição; ele é a única linha sem combobox de parentesco.
 *
 * Isto corrige um bug real da versão anterior, que assumia "parentesco = 1º
 * select da linha, estado civil = último". Na linha do requerente há um único
 * controle: os dois índices apontavam para o mesmo elemento, e o estado civil
 * era sobrescrito pelo parentesco sem gerar aviso.
 */
async function passo4GrupoFamiliar(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<void> {
  await esperarTela(page, /Grupo Familiar/i);

  await aguardarGrupoFamiliarEstavel(page, caso.grupoFamiliar.integrantes.length);

  const porCpf = new Map<string, (typeof caso.grupoFamiliar.integrantes)[number]>();
  for (const i of caso.grupoFamiliar.integrantes) {
    const c = chaveCpf(i.cpf);
    if (c) porCpf.set(c, i);
  }
  const cpfRequerente = chaveCpf(caso.grupoFamiliar.requerenteCpf ?? caso.cliente.cpf);
  const titularPlanilha = porCpf.get(cpfRequerente)
    ?? caso.grupoFamiliar.integrantes.find((i) =>
      ['titular', 'requerente'].includes(normalizar(i.parentesco ?? '')),
    );

  const linhas = await lerLinhasGrupoFamiliar(page);

  console.log(
    `[P4] linhas detectadas=${linhas.length} ` +
      `${JSON.stringify(linhas)} | integrantes na planilha=${caso.grupoFamiliar.integrantes.length}`,
  );

  if (linhas.length === 0) {
    avisos.push('O GERID não listou nenhum integrante do grupo familiar — confira o CadÚnico.');
  }

  /** Campos que o robô tentou preencher e não conseguiu. Bloqueiam o Avançar. */
  const falhas: string[] = [];
  const vistos = new Set<string>();

  /** Valor que está na tela agora. `null` = o combobox nem existe nesta linha. */
  const valorNaTela = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? null;

  for (const linha of linhas) {
    const ehRequerente = linha.ehRequerente;
    // A tela pode ter perdido zeros à esquerda; a planilha não. Comparar pela
    // chave de 11 dígitos é o que faz as duas listas falarem do mesmo CPF.
    const cpfLinha = chaveCpf(linha.cpf);
    if (cpfLinha) vistos.add(cpfLinha);

    // --- Estado civil: existe em TODAS as linhas, inclusive a do requerente.
    const integrantePlanilha = (cpfLinha ? porCpf.get(cpfLinha) : undefined)
      ?? (ehRequerente ? titularPlanilha : undefined);
    const parentescoPlanilha = integrantePlanilha?.parentesco ?? '';
    const estadoCivil = estadoCivilGerid(integrantePlanilha?.estadoCivil);
    const okEc = await escolherNoCombobox(
      page,
      mapaGerid.passo4.estadoCivil(linha.indice),
      estadoCivil,
    );
    if (!okEc) {
      avisos.push(
        `Linha ${linha.indice + 1}: não consegui marcar o estado civil "${estadoCivil}".`,
      );
    }

    // --- Parentesco: NÃO existe na linha do requerente (vem fixo "Requerente").
    if (ehRequerente) continue;

    if (!linha.cpf) {
      avisos.push(
        `Linha ${linha.indice + 1}: não consegui ler o CPF na tela — parentesco não preenchido.`,
      );
      continue;
    }

    if (!integrantePlanilha) {
      avisos.push(
        `CPF ${cpfLinha} veio do CadÚnico mas não está na planilha — confira o parentesco.`,
      );
    }

    /**
     * Sem parentesco na planilha, o `mapearParentesco('')` devolve "Outros" —
     * um chute. Se o GERID já trouxe o campo preenchido (o CadÚnico sabe quem é
     * filho de quem), escrever por cima trocaria dado certo por chute, e no BPC
     * o parentesco não é decoração: é ele que define quem entra no cálculo da
     * renda por pessoa da casa. Então: só se escreve sobre o que a tela trouxe
     * quando a planilha tem alguma coisa a dizer.
     */
    if (!parentescoPlanilha.trim() && valorNaTela(`selectParentesco${linha.indice}`)) {
      continue;
    }

    const resolvido = mapearParentesco(parentescoPlanilha);
    const okP = await escolherNoCombobox(
      page,
      mapaGerid.passo4.parentesco(linha.indice),
      resolvido.grupo ?? '',
    );

    if (!okP) {
      avisos.push(
        `Linha ${linha.indice + 1}: não achei a opção de parentesco "${resolvido.grupo}".`,
      );
    } else if (!resolvido.exato) {
      const decisao = resolvido.grupo === 'Outros'
        ? 'não tem opção própria no GERID; marquei "Outros"'
        : `foi interpretado como "${resolvido.grupo}"`;
      avisos.push(`CPF ${cpfLinha}: parentesco "${parentescoPlanilha}" ${decisao}. Confira antes de concluir.`);
    }
  }

  // --- Conferência final, e única fonte de verdade do que bloqueia o Avançar.
  //
  // O laço acima preenche às cegas; a tabela pode ganhar uma linha DEPOIS dele.
  // Quando isso acontece o GERID renumera os ids e o valor já escrito passa a
  // pertencer a outra pessoa. Reler a tela estabilizada e completar o que ficou
  // vazio é o que impede o requerimento sair com o dado trocado de pessoa.
  await aguardarGrupoFamiliarEstavel(page, caso.grupoFamiliar.integrantes.length);
  const linhasFinais = await lerLinhasGrupoFamiliar(page);

  if (linhasFinais.length !== linhas.length) {
    avisos.push(
      'O GERID mudou a tabela do grupo familiar durante o preenchimento '
        + `(${linhas.length} -> ${linhasFinais.length} linhas). Confira antes de concluir.`,
    );
  }

  for (const linha of linhasFinais) {
    const cpfLinha = chaveCpf(linha.cpf);
    const integrante = (cpfLinha ? porCpf.get(cpfLinha) : undefined)
      ?? (linha.ehRequerente ? titularPlanilha : undefined);

    if (valorNaTela(`selectEstadoCivil${linha.indice}`) === '') {
      const alvo = estadoCivilGerid(integrante?.estadoCivil);
      if (!(await escolherNoCombobox(page, mapaGerid.passo4.estadoCivil(linha.indice), alvo))) {
        falhas.push(`selectEstadoCivil${linha.indice} ("${alvo}")`);
      }
    }

    // `null` aqui é a linha do requerente, que não tem combobox de parentesco.
    if (valorNaTela(`selectParentesco${linha.indice}`) === '') {
      const parentescoPlanilha = integrante?.parentesco ?? '';
      const alvo = mapearParentesco(parentescoPlanilha).grupo ?? '';
      if (!(await escolherNoCombobox(page, mapaGerid.passo4.parentesco(linha.indice), alvo))) {
        falhas.push(`selectParentesco${linha.indice} ("${alvo}")`);
      } else if (!parentescoPlanilha.trim()) {
        // O campo é obrigatório e ninguém disse o que é: nem a planilha, nem o
        // CadÚnico. Marcar "Outros" é o que destrava o Avançar, mas continua
        // sendo um chute — e chute que ninguém vê vira protocolo errado.
        avisos.push(
          `CPF ${cpfLinha || '(não lido)'}: parentesco não informado na planilha e o GERID `
            + 'trouxe o campo vazio; marquei "Outros". Confira antes de concluir.',
        );
      }
    }
  }

  console.log(
    `[P4] conferência final: ${linhasFinais.length} linha(s) ${JSON.stringify(linhasFinais)}`,
  );

  // Integrantes da planilha que o CadÚnico não trouxe.
  for (const cpf of porCpf.keys()) {
    if (!vistos.has(cpf)) {
      avisos.push(`CPF ${cpf} está na planilha mas o GERID não listou — divergência com o CadÚnico.`);
    }
  }

  // "Há alguém que você queira incluir ou excluir?" -> sempre Não.
  // ⚠️ São CHECKBOXES (`undefined-Nao`), não botões — o código antigo procurava
  // por getByRole('button') e falharia aqui.
  // A pergunta é renderizada ABAIXO da tabela, então só existe depois dela.
  const limiteNao = Date.now() + 10_000;
  while (Date.now() < limiteNao && !document.getElementById('undefined-Nao')) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const estaMarcado = () => Boolean(
    (document.getElementById('undefined-Nao') as HTMLInputElement | null)?.checked,
  );

  // Tentamos mais de uma vez: um re-render do React logo depois do clique
  // desmarca o checkbox sem avisar.
  let naoMarcado = estaMarcado();
  for (let tentativa = 0; tentativa < 3 && !naoMarcado; tentativa++) {
    const nao = visivel(page.locator(mapaGerid.passo4.incluirExcluirNao)).first();
    if (await existeInputNoDom(nao)) {
      await garantirMarcado(nao);
    } else {
      const alt = visivel(page.getByLabel(/^N.o$/i)).last();
      if (await existeInputNoDom(alt)) {
        await garantirMarcado(alt);
      } else {
        avisos.push('Não achei a opção "Não" de incluir/excluir integrante — marque manualmente.');
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    naoMarcado = estaMarcado();
    console.log(`[P4] incluir/excluir "Não" tentativa=${tentativa} marcado=${naoMarcado}`);
  }

  console.log(`[P4] incluir/excluir "Não" marcado=${naoMarcado} | falhas=${JSON.stringify(falhas)}`);
  if (!naoMarcado) falhas.push('undefined-Nao (incluir/excluir = "Não")');

  // Antes o robô seguia para o Avançar mesmo com campo vazio: o GERID recusava
  // e o operador recebia "não saiu de passo_4", que é a consequência e não a
  // causa. Falhar aqui aponta o campo exato.
  if (falhas.length > 0) {
    throw new ErroGerid(
      FalhaGerid.ERRO_PREENCHIMENTO,
      `Não consegui preencher no Grupo Familiar: ${falhas.join(', ')}. ` +
        'Os valores existem na tela, então é falha de acionamento — veja as linhas [P4] no console.',
    );
  }

  await avancar(page, 'passo_4');
}

/** Uma linha da tabela do grupo familiar, do jeito que o GERID a renderizou. */
interface LinhaGrupoFamiliar {
  indice: number;
  cpf: string;
  ehRequerente: boolean;
}

/**
 * Lê as linhas que o GERID renderizou e o CPF de cada uma.
 *
 * Só chame com a tabela estável (`aguardarGrupoFamiliarEstavel`): os ids são
 * posicionais, então uma linha que chegue no meio da leitura renumera todas.
 */
function lerLinhasGrupoFamiliar(page: Page): Promise<LinhaGrupoFamiliar[]> {
  return page.evaluate(() => {
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const out: Array<{ indice: number; cpf: string; ehRequerente: boolean }> = [];
    for (let i = 0; i < 40; i++) {
      const ec = document.getElementById(`selectEstadoCivil${i}`);
      if (!ec) break;
      const tr = ec.closest('tr') as HTMLElement | null;
      const primeiraCelula = tr?.querySelector('td') as HTMLElement | null;
      const digitos = norm(primeiraCelula?.innerText || '').replace(/\D/g, '');
      // O GERID remove o zero inicial e exibe 093... como 930... (10 dígitos).
      const cpf = digitos.length === 10 ? digitos.padStart(11, '0') : digitos;
      const ehRequerente = !document.getElementById(`selectParentesco${i}`);
      out.push({ indice: i, cpf, ehRequerente });
    }
    return out;
  });
}

/**
 * Assinatura da tabela do grupo familiar: um item por linha REAL, com o CPF e a
 * presença do combobox de parentesco.
 *
 * ⚠️ A versão anterior contava `[id^="selectEstadoCivil"]`, um seletor por
 * prefixo que também casa com o container `selectEstadoCivil0-itens` e com os
 * radios de cada opção. Com UMA linha na tela o total já dava >= 2: a espera
 * dava a tabela por pronta em 250 ms e o robô lia o grupo familiar pela metade.
 * A linha que faltava chegava depois, renumerando os ids, e o valor já escrito
 * ia parar na linha errada. Era a causa do "às vezes funciona, às vezes não".
 */
function assinaturaGrupoFamiliar(page: Page): Promise<string> {
  return page.evaluate(() => {
    const combos = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[id^="selectEstadoCivil"]'),
    ).filter((combo) => /^selectEstadoCivil\d+$/.test(combo.id));
    return combos
      .map((combo) => {
        const linha = combo.closest('tr');
        const cpf = linha?.querySelector<HTMLElement>('td')?.innerText.replace(/\D/g, '') ?? '';
        const indice = combo.id.replace('selectEstadoCivil', '');
        // A linha do requerente é a única sem combobox de parentesco. Se ela
        // ainda não chegou, a assinatura muda e a espera continua.
        const temParentesco = Boolean(document.getElementById(`selectParentesco${indice}`));
        return `${combo.id}:${cpf}:${temParentesco ? 'p' : '-'}`;
      })
      .join('|');
  });
}

/**
 * Espera a tabela do CadÚnico parar de mudar antes de qualquer leitura.
 *
 * `totalEsperado` é só uma dica vinda da planilha: o CadÚnico pode legitimamente
 * listar menos gente. Por isso a saída é por ESTABILIDADE, não por contagem —
 * atingir o total esperado apenas encurta a espera.
 */
async function aguardarGrupoFamiliarEstavel(page: Page, totalEsperado: number): Promise<void> {
  const limite = Date.now() + 20_000;
  let assinaturaAnterior = '';
  let estavelDesde = Date.now();

  while (Date.now() < limite) {
    const atual = await assinaturaGrupoFamiliar(page);
    const totalAtual = atual ? atual.split('|').length : 0;

    if (atual !== assinaturaAnterior) {
      assinaturaAnterior = atual;
      estavelDesde = Date.now();
    }

    const parado = Date.now() - estavelDesde;
    const completa = totalAtual >= Math.max(1, totalEsperado);
    // Com o total esperado na tela, 700 ms parado já basta. Sem ele, exigimos
    // 3 s de imobilidade para concluir que o GERID realmente trouxe menos gente.
    if (totalAtual > 0 && parado >= (completa ? 700 : 3_000)) {
      console.log(`[P4] tabela estável: ${totalAtual} linha(s) | ${atual}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(
    `[P4] tabela NÃO estabilizou em 20s. Última leitura: ${assinaturaAnterior || '(vazia)'}`,
  );
}

// ---------------------------------------------------------------------------
// Passos 5 e 6 — perguntas simples
// ---------------------------------------------------------------------------

async function passo5e6Perguntas(page: Page, avisos: string[]): Promise<void> {
  // Passo 5 — Comprometimento de Renda: sempre Não.
  await marcarNaoSimples(page, avisos, 'Comprometimento de Renda');
  await avancar(page, 'passo_5');

  // Passo 6 — Proteção Especial SUAS: sempre Não.
  await marcarNaoSimples(page, avisos, 'Proteção Especial SUAS');
  await avancar(page, 'passo_6');
}

/**
 * Os passos 5 e 6 não foram capturados no DOM, mas seguem o padrão do passo 4
 * (checkbox `*-Nao` / `*-Sim`). O robô tenta as duas formas conhecidas e, se
 * nenhuma funcionar, avisa em vez de travar — a resposta é sempre "Não" e o
 * advogado consegue marcar em um clique na revisão.
 */
async function marcarNaoSimples(page: Page, avisos: string[], tela: string): Promise<void> {
  const porId = visivel(page.locator('input[id$="-Nao"]')).last();
  if (await existeInputNoDom(porId)) {
    await garantirMarcado(porId);
    return;
  }
  const porRotulo = visivel(page.getByLabel(/^N.o$/i)).last();
  if (await existeInputNoDom(porRotulo)) {
    await garantirMarcado(porRotulo);
    return;
  }
  avisos.push(`${tela}: não achei a opção "Não" — marque manualmente (a resposta é sempre Não).`);
}

// ---------------------------------------------------------------------------
// Passo 7 — Dados Requerente
// ---------------------------------------------------------------------------

async function passo7DadosRequerente(
  page: Page,
  caso: CasoParaProtocolar,
  opcoes: OpcoesPreenchimento,
  avisos: string[],
): Promise<boolean> {
  await esperarTela(page, /Dados Adicionais|Interessados/i);

  // Um aviso sobreposto congela a tela inteira: os comboboxes continuam no HTML,
  // mas nada responde. Limpar antes evita um relatório inteiro de "não encontrei
  // a pergunta" que na verdade quer dizer "tinha uma janela por cima".
  for (const fechado of await fecharAvisosSobrepostos(page)) {
    console.log(`[P7] aviso sobreposto fechado: ${fechado}`);
  }

  // --- Contatos
  const telefone = caso.cliente.telefone?.trim() || opcoes.telefonePadrao;
  const celularConfirmado = await adicionarContato(page, 'Celular', telefone, avisos);
  const emailConfirmado = await adicionarContato(page, 'E-mail', opcoes.emailEscritorio, avisos);
  if (!celularConfirmado || !emailConfirmado) return false;

  // Campo obrigatório separado dos comboboxes de dados adicionais.
  const acompanha = visivel(page.locator(mapaGerid.passo7.acompanharProcessoSim)).first();
  if (await existeInputNoDom(acompanha)) await garantirMarcado(acompanha);
  else {
    avisos.push('Não achei a opção "Sim" para acompanhar o processo — marque manualmente.');
    return false;
  }

  // Fechar a janela de contatos pode revelar um aviso que estava atrás dela.
  await fecharAvisosSobrepostos(page);

  // --- Perguntas fixas, localizadas pelo texto (os ids são hash)
  await esperarPerguntasEstaveis(page);
  await responderPergunta(page, PERGUNTAS_PASSO7.estrangeiro, RESPOSTAS_FIXAS.estrangeiro, avisos);
  await responderPergunta(
    page,
    PERGUNTAS_PASSO7.representanteLegal,
    RESPOSTAS_FIXAS.representanteLegal,
    avisos,
  );
  await responderPergunta(page, PERGUNTAS_PASSO7.procurador, RESPOSTAS_FIXAS.procurador, avisos);
  await responderPergunta(page, PERGUNTAS_PASSO7.ondeMora, RESPOSTAS_FIXAS.ondeMora, avisos);
  await responderPergunta(
    page,
    PERGUNTAS_PASSO7.formaConvivio,
    formaDeConvivio(caso.grupoFamiliar),
    avisos,
    true,
  );
  await responderPergunta(
    page,
    PERGUNTAS_PASSO7.recebeBeneficio,
    RESPOSTAS_FIXAS.recebeBeneficio,
    avisos,
  );
  await responderPergunta(
    page,
    PERGUNTAS_PASSO7.alterarDataPedido,
    RESPOSTAS_FIXAS.alterarDataPedido,
    avisos,
  );

  // --- Perguntas dinâmicas (ex: Acordo Internacional) ---
  await responderPergunta(page, PERGUNTAS_PASSO7.quemAtendido, RESPOSTAS_FIXAS.quemAtendido, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.resideBrasil, RESPOSTAS_FIXAS.resideBrasil, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.beneficioExclusivoExterior, RESPOSTAS_FIXAS.beneficioExclusivoExterior, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.condicaoDeficiencia, RESPOSTAS_FIXAS.condicaoDeficiencia, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.tempoRural, RESPOSTAS_FIXAS.tempoRural, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.concederOutraAposentadoria, RESPOSTAS_FIXAS.concederOutraAposentadoria, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.cessacaoBeneficio, RESPOSTAS_FIXAS.cessacaoBeneficio, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.pensaoPorMorte, RESPOSTAS_FIXAS.pensaoPorMorte, avisos, true);

  // --- Perguntas dinâmicas (Acertos para Marcação de Perícia Médica) ---
  await responderPergunta(page, PERGUNTAS_PASSO7.procuradorRepresentanteLegal, RESPOSTAS_FIXAS.procuradorRepresentanteLegal, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.ajusteNovoAuxilio, RESPOSTAS_FIXAS.ajusteNovoAuxilio, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.motivoSolicitacao, RESPOSTAS_FIXAS.motivoSolicitacao, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.empregado, RESPOSTAS_FIXAS.empregado, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.estadoCivil7, RESPOSTAS_FIXAS.estadoCivil7, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.corRaca, RESPOSTAS_FIXAS.corRaca, avisos, true);
  await responderPergunta(page, PERGUNTAS_PASSO7.grauInstrucao, RESPOSTAS_FIXAS.grauInstrucao, avisos, true);

  // --- Bolsa Família: 4 opções, e o escritório ainda não definiu a regra.
  // Deixar em branco e avisar é melhor do que declarar errado ao INSS.
  if (RESPOSTA_BOLSA_FAMILIA) {
    await responderPergunta(page, PERGUNTAS_PASSO7.bolsaFamilia, RESPOSTA_BOLSA_FAMILIA, avisos);
  } else {
    avisos.push(
      'Bolsa Família: a pergunta tem 4 opções (não Sim/Não) e o escritório ainda não definiu ' +
      'a regra. Deixei em branco — responda antes de concluir.',
    );
    return false;
  }

  // --- CPF do procurador
  // Não é motivo para abandonar a tela: anexar não envia nada ao INSS, só
  // prepara o requerimento. Melhor entregar o passo 7 inteiro montado e pedir
  // um campo do que devolver a tela crua e obrigar a refazer tudo à mão.
  let cpfProcId = await campoCpfProcurador(page);
  if (!cpfProcId) {
    // O requerimento é RETOMADO, e aí a resposta "Sim" vem pronta do servidor:
    // o React desenha o valor, mas o campo condicional que ele controla só
    // nasce no evento de troca, que nunca aconteceu nesta sessão. Repetir a
    // MESMA resposta não muda dado nenhum e faz o campo aparecer.
    const idPergunta = await comboPorPergunta(page, 'Deseja cadastrar Procurador');
    const antes = idPergunta
      ? await visivel(page.locator(`[id="${cssEscape(idPergunta)}"]`)).first().inputValue().catch(() => '')
      : '';
    if (antes.trim()) {
      console.log('[P7] campo do CPF nao montado; repetindo a resposta', JSON.stringify(antes));
      await escolherNoCombobox(page, idPergunta!, antes.trim()).catch(() => false);
      const depois = await visivel(page.locator(`[id="${cssEscape(idPergunta!)}"]`)).first()
        .inputValue().catch(() => '');
      // Se a repetição derrubou a resposta, isso é pior do que o campo faltando:
      // o requerimento ficaria com uma pergunta obrigatória em branco.
      if (!depois.trim()) {
        avisos.push(`A pergunta "Deseja cadastrar Procurador para este pedido?" ficou em branco — responda "${antes.trim()}" na tela.`);
      }
      cpfProcId = await campoCpfProcurador(page, 4000);
    }
  }
  // O GERID já disse com todas as letras que este campo é obrigatório ("O
  // campo adicional 'CPF do Procurador' deve ser preenchido"). Então não dá
  // mais para seguir em frente e deixar ele validar: sem o CPF o Avançar é
  // recusa certa, e recusa vira erro fatal em vez de um pedido claro.
  let cpfProcuradorPendente = '';
  const preencherCpfProcurador = async (id: string): Promise<string> => {
    const campo = visivel(page.locator(`[id="${cssEscape(id)}"]`)).first();
    await campo.fill(apenasDigitos(opcoes.procuradorCpf));
    return apenasDigitos(await campo.inputValue().catch(() => '')) === apenasDigitos(opcoes.procuradorCpf)
      ? ''
      : 'o GERID não aceitou o CPF do procurador que digitei';
  };
  if (cpfProcId) {
    cpfProcuradorPendente = await preencherCpfProcurador(cpfProcId);
    console.log('[P7] CPF do procurador preenchido em', cpfProcId);
  }

  // --- Checkboxes de ciência.
  // ⚠️ O código antigo marcava TODOS os checkboxes da página, às cegas. Agora
  // só marca os que começam com "campo-", que é o padrão do GERID para
  // checkbox de campo (confirmado no DOM). Nada de marcar declaração por acaso.
  const ciencias = visivel(page.locator('input[type="checkbox"][id^="campo-"]'));
  const totalCiencias = await contarAnexados(ciencias).catch(() => 0);
  for (let i = 0; i < totalCiencias; i++) {
    await garantirMarcado(ciencias.nth(i));
  }

  // Anexar SEMPRE, mesmo com pendência acima: anexo fica na tela, não vai ao
  // INSS. Assim o operador chega numa tela pronta, com os documentos no lugar.
  // ⚠️ A conferência de anexo obrigatório sai do que o GERID assumiu, e não de
  // `input.files`: o FileList é escrito por nós, então lê-lo de volta só prova
  // que a extensão sabe escrever. Foi esse teste circular que fez o robô jurar
  // ter anexado enquanto o GERID cobrava os mesmos dois documentos.
  const anexosConfirmados = await anexarDocumentos(page, opcoes, avisos);
  const anexosObrigatoriosAusentes = SLOTS_GERID
    .filter((slot) => slot.obrigatorio && !anexosConfirmados.has(slot.rotulo))
    .map((slot) => slot.rotulo);

  // Última chance para o CPF do procurador, agora com os anexos no lugar.
  // ⚠️ Ordem importa: a tela já mostra o slot "Documento de identificação do
  // procurador (OAB/RG/CNH/CTPS)" ANTES de existir campo de CPF, ou seja, o
  // GERID monta o bloco do procurador em partes. Anexar o documento dele é um
  // evento a mais no formulário, e o operador relatou que "demora um tempão e
  // depois avança" — a tela termina de montar sozinha. Procurar de novo aqui
  // custa nada quando o campo já foi preenchido e evita mandar para revisão
  // manual um requerimento que só precisava de mais alguns segundos.
  if (!cpfProcId) {
    cpfProcId = await campoCpfProcurador(page, 15_000);
    if (cpfProcId) {
      cpfProcuradorPendente = await preencherCpfProcurador(cpfProcId);
      console.log('[P7] CPF do procurador so apareceu depois dos anexos:', cpfProcId);
    } else {
      const pistas = await pistasDoProcurador(page).catch(() => [] as string[]);
      console.log('[P7] campo do CPF do procurador nao encontrado. Na tela:', pistas);
      cpfProcuradorPendente = 'não achei o campo "CPF do Procurador" na tela'
        + (pistas.length ? ` (o que há nela: ${pistas.slice(0, 10).join(' · ')})` : '');
    }
  }

  // Só agora o balanço: o que ficou faltando, tudo de uma vez.
  const bloqueios: string[] = [];
  if (cpfProcuradorPendente) bloqueios.push(cpfProcuradorPendente);
  const perguntasPendentes = listarPerguntasObrigatoriasPendentes();
  if (perguntasPendentes.length) {
    bloqueios.push(`${perguntasPendentes.length} pergunta(s) obrigatória(s): ${perguntasPendentes.join(' | ')}`);
  }
  if (anexosObrigatoriosAusentes.length) {
    bloqueios.push(`anexo(s) obrigatório(s): ${anexosObrigatoriosAusentes.join(' | ')}`);
  }
  if (bloqueios.length) {
    avisos.push(
      `Preenchi e anexei o resto do passo 7. Falta ${bloqueios.join(' e ')} — ` +
      'complete na tela e clique em Avançar.',
    );
    return false;
  }

  await avancar(page, 'passo_7');
  return true;
}

async function adicionarContato(
  page: Page,
  tipo: string,
  valor: string,
  avisos: string[],
): Promise<boolean> {
  if (!valor) {
    avisos.push(`Contato ${tipo} não informado — adicione manualmente.`);
    return false;
  }
  let operacao = 'abrir a janela de contatos';
  try {
    const tipoContato = visivel(page.locator(mapaGerid.passo7.tipoContato)).first();
    if (!(await tipoContato.isVisible().catch(() => false))) {
      const editar = visivel(page.locator(
        '[aria-label^="Clique para editar contatos do interessado"]',
      )).first();
      await editar.click();
      await tipoContato.waitFor({ state: 'visible', timeout: 3_000 });
    }

    operacao = 'consultar os contatos existentes';
    const jaExiste = await contatoExisteNoDialogo(page, tipo, valor);

    if (jaExiste) {
      operacao = 'fechar a janela de contatos';
      if (!await clicarBotaoContatos(page, 'Fechar')) {
        throw new Error('botão Fechar não encontrado dentro da janela');
      }
      return true;
    }

    operacao = `selecionar o tipo ${tipo}`;
    const ok = await escolherNoCombobox(page, mapaGerid.passo7.tipoContato, tipo);
    if (!ok) throw new Error(`Tipo de contato "${tipo}" não confirmado.`);

    operacao = `preencher o valor de ${tipo}`;
    const campoValor = visivel(page.locator(mapaGerid.passo7.valorContato)).first();
    await campoValor.waitFor({ state: 'visible', timeout: 3_000 });

    // O GERID só libera o campo Valor depois que o tipo está REALMENTE
    // selecionado. Enquanto ele continuar `disabled`, o combobox apenas exibiu
    // o texto sem registrar a escolha — e preencher assim produz um "Adicionar"
    // silenciosamente vazio. Falhar aqui aponta a causa de verdade.
    const seletorValor = mapaGerid.passo7.valorContato;
    const limiteHabilitar = Date.now() + 4_000;
    let habilitado = false;
    while (!habilitado && Date.now() < limiteHabilitar) {
      habilitado = await page.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        return Boolean(el) && !el!.disabled && !el!.readOnly;
      }, seletorValor);
      if (!habilitado) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!habilitado) {
      throw new Error(
        `o campo Valor continuou bloqueado — o GERID não registrou o tipo "${tipo}" `
          + 'no combobox (o texto apareceu, mas a seleção não).',
      );
    }

    // O campo acabou de sair do `disabled`, ou seja, o React renderizou agora.
    // Escrever em cima de um render em andamento faz o valor "piscar": ele
    // aparece na tela e o próximo render devolve o estado vazio do React.
    // Por isso escrevemos, esperamos, e só aceitamos se o valor SOBREVIVER.
    let escreveu = false;
    for (let tentativa = 0; tentativa < 4 && !escreveu; tentativa++) {
      await campoValor.fill(valor);
      await new Promise((resolve) => setTimeout(resolve, 300));
      escreveu = (await campoValor.inputValue().catch(() => '')).trim() !== '';
      console.log(`[P7] valor ${tipo} tentativa=${tentativa} sobreviveu=${escreveu}`);
    }
    if (!escreveu) {
      throw new Error(
        `o valor não ficou no campo — o React do GERID apagou "${valor}" logo depois de escrito.`,
      );
    }

    operacao = `adicionar o contato ${tipo}`;
    const limiteBotao = Date.now() + 2_000;
    let adicionou = false;
    while (!adicionou && Date.now() < limiteBotao) {
      adicionou = await clicarBotaoContatos(page, 'Adicionar');
      if (!adicionou) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!adicionou) throw new Error('botão Adicionar não ficou disponível dentro da janela');

    operacao = `confirmar o contato ${tipo} na tabela`;
    let confirmou = false;
    const limiteConfirmacao = Date.now() + 3_000;
    while (!confirmou && Date.now() < limiteConfirmacao) {
      confirmou = await contatoExisteNoDialogo(page, tipo, valor);
      if (!confirmou) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!confirmou) {
      // O GERID quase sempre diz o motivo em texto. Repetir a reclamação dele
      // vale mais do que o nosso palpite sobre o que faltou.
      const reclamacao = await mensagensDoDialogoContatos(page);
      throw new Error(
        `O GERID não exibiu o contato ${tipo} depois de adicionar.`
          + (reclamacao ? ` Ele reclamou: "${reclamacao}".` : ''),
      );
    }

    operacao = 'fechar a janela de contatos';
    if (!await clicarBotaoContatos(page, 'Fechar')) {
      throw new Error('botão Fechar não encontrado dentro da janela');
    }
    return true;
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    avisos.push(`Falhei ao adicionar o contato ${tipo} em "${operacao}": ${detalhe}`);
    return false;
  }
}

async function clicarBotaoContatos(page: Page, rotulo: string): Promise<boolean> {
  return page.evaluate(({ textoBotao }) => {
    const normalizarTexto = (entrada: string) => entrada.replace(/\s+/g, ' ').trim().toLowerCase();
    const raiz = document.querySelector<HTMLElement>('#contatos');
    if (!raiz) return false;
    const botao = Array.from(
      raiz.querySelectorAll<HTMLElement>('button, [role="button"]'),
    ).find((elemento) => {
      const estilo = window.getComputedStyle(elemento);
      const desabilitado = (elemento as HTMLButtonElement).disabled ||
        elemento.getAttribute('aria-disabled') === 'true';
      const nome = elemento.getAttribute('aria-label') || elemento.innerText || elemento.textContent || '';
      return !desabilitado &&
        elemento.getClientRects().length > 0 &&
        estilo.display !== 'none' &&
        estilo.visibility !== 'hidden' &&
        normalizarTexto(nome) === normalizarTexto(textoBotao);
    });
    if (!botao) return false;
    botao.click();
    return true;
  }, { textoBotao: rotulo });
}

/**
 * O que o GERID RECLAMOU na tela — só reclamação, nunca instrução.
 *
 * A mesma classe CSS (`.feedback`) serve para o aviso de erro e para o texto de
 * ajuda dos anexos ("O tamanho de cada arquivo não pode exceder 5.00MB"). Citar
 * a ajuda como se fosse erro manda o operador investigar o lugar errado, então
 * aqui só passa texto que tem cara de cobrança.
 */
async function mensagensDoDialogoContatos(page: Page): Promise<string> {
  return page.evaluate(() => {
    const seletores = [
      '.feedback', '.br-message', '[role="alert"]', '.invalid-feedback',
      '.text-danger', '.is-invalid ~ .feedback', '.error, .erro',
    ].join(', ');

    const visivel = (el: HTMLElement) => el.getClientRects().length > 0;
    const limpar = (el: HTMLElement) => (el.innerText || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

    // Cobrança de verdade fala de campo, obrigatoriedade ou falha. Texto de
    // ajuda fala de tamanho de arquivo, formato aceito e afins.
    const pareceReclamacao = (texto: string) => {
      const t = texto.toLowerCase();
      if (!t || t.length > 300) return false;
      if (/mb\b|kb\b|megabyte|extens|formato aceito|comprobat/.test(t)) return false;
      return /obrigat|inval|inv[aá]lid|deve ser|n[aã]o foi poss|n[aã]o p[oô]de|erro|falh|preench|j[aá] (existe|cadastrad)|duplicad|permitid/
        .test(t);
    };

    // O modal aberto tem prioridade: é onde o GERID responde ao que o robô
    // acabou de fazer. Só se ele estiver mudo é que olhamos a página inteira.
    const modais = Array.from(
      document.querySelectorAll<HTMLElement>('#contatos, .br-modal, [role="dialog"]'),
    ).filter(visivel);

    const colher = (raizes: Element[]) => {
      const vistos = new Set<string>();
      for (const raiz of raizes) {
        for (const el of Array.from(raiz.querySelectorAll<HTMLElement>(seletores))) {
          if (!visivel(el)) continue;
          const texto = limpar(el);
          if (pareceReclamacao(texto)) vistos.add(texto);
        }
      }
      return Array.from(vistos).slice(0, 3).join(' | ');
    };

    return colher(modais) || colher([document.body]);
  });
}

/**
 * O contato aparece na tabela do modal?
 *
 * A conferência é propositalmente TOLERANTE, porque a tela escreve diferente do
 * que a lista oferece: escolhemos "E-mail" e a tabela mostra "EMAIL"; escolhemos
 * "Celular" e ela mostra "TELEFONE CELULAR"; o número sai formatado
 * "(62) 9 9353-3635". Comparar texto cru daria falso negativo — e falso negativo
 * aqui faz o robô refazer um contato que JÁ ENTROU.
 */
async function contatoExisteNoDialogo(page: Page, tipo: string, valor: string): Promise<boolean> {
  return page.evaluate(({ tipoEsperado, valorEsperado }) => {
    const soAlfanumerico = (entrada: string) => (entrada || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const soDigitos = (entrada: string) => (entrada || '').replace(/\D/g, '');

    // Famílias de rótulo: qualquer apelido da mesma família vale pelo outro.
    const familias = [
      ['celular', 'telefonecelular', 'movel', 'telefonemovel'],
      ['email', 'correioeletronico', 'eletronico'],
      ['telefonecomercial', 'comercial', 'telefonetrabalho'],
      ['telefoneresidencial', 'residencial', 'fixo', 'telefone'],
    ];
    const familiaDe = (chave: string) => familias.find((f) => f.includes(chave));

    const tipoChave = soAlfanumerico(tipoEsperado);
    const apelidos = familiaDe(tipoChave) ?? [tipoChave];
    const ehEmail = valorEsperado.includes('@') || tipoChave.includes('mail');

    const digitosEsperados = soDigitos(valorEsperado);
    // O GERID pode exibir com ou sem DDI/DDD e com o nono dígito separado. Os
    // últimos 8 dígitos são o que sobrevive a qualquer máscara.
    const fim = digitosEsperados.slice(-8);
    const emailEsperado = soAlfanumerico(valorEsperado);

    const bate = (bruto: string) => {
      const chave = soAlfanumerico(bruto);
      const tipoOk = apelidos.some((apelido) => chave.includes(apelido));
      if (!tipoOk) return false;
      if (ehEmail) return chave.includes(emailEsperado);
      const digitos = soDigitos(bruto);
      return Boolean(fim) && digitos.includes(fim);
    };

    // Preferimos o modal; se ele já fechou, a tabela de Interessados da página
    // mostra o mesmo contato — e serve igual como prova de que entrou.
    const raizes = [
      document.querySelector<HTMLElement>('#contatos'),
      ...Array.from(document.querySelectorAll<HTMLElement>('.br-modal, [role="dialog"]')),
      document.body,
    ].filter((el): el is HTMLElement => Boolean(el));

    for (const raiz of raizes) {
      const linhas = Array.from(raiz.querySelectorAll<HTMLElement>('tbody tr, tr, li'));
      if (linhas.some((linha) => bate(linha.innerText || linha.textContent || ''))) return true;
    }
    return false;
  }, { tipoEsperado: tipo, valorEsperado: valor });
}

/**
 * Anexa cada documento na CAIXA nomeada certa.
 *
 * Os 11 `input[type=file]` compartilham `id="single-file"`, então a caixa é
 * localizada pelo TEXTO do slot; o índice conhecido (0-10) serve de conferência
 * cruzada, já que a ordem é estável.
 */
type ResultadoAnexo = { registrado: boolean; via: string; detalhe: string };

/**
 * Entrega os arquivos numa caixa de anexo e confere se o GERID de fato os
 * assumiu.
 *
 * O `input[type=file]` do GERID é `display:none` — quem aparece é o botão do
 * design system do gov.br. Escrever `input.files` cria o FileList de verdade,
 * mas não avisa o componente: ele continua com a lista vazia por dentro e, no
 * "Avançar", re-renderiza por cima e apaga o que escrevemos. Foi exatamente o
 * que aconteceu na prática — `files.length > 0` logo depois de anexar e
 * `files: 0` depois da recusa, com o GERID cobrando os mesmos documentos.
 *
 * Daí as duas mudanças aqui:
 *
 * 1. A conferência olha o TEXTO RENDERIZADO da caixa, não o `input.files` que
 *    nós mesmos acabamos de escrever. Conferir a própria escrita não prova
 *    nada — foi o que mascarou esse bug até agora.
 * 2. Se os eventos `input`/`change` não bastarem, repete pelo `drop`, que é o
 *    mesmo gesto de arrastar o arquivo com o mouse para a área de upload.
 *    Nada inventado: evento padrão de DOM no elemento que já localizamos.
 */
async function entregarAnexo(
  alvo: Locator,
  pacote: Array<{ nome: string; mimeType?: string; base64: string }>,
): Promise<ResultadoAnexo> {
  const compactar = (texto: string) => (texto || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const nomes = pacote.map((arquivo) => arquivo.nome).filter(Boolean);

  // Caixa com arquivo dentro ganha um controle para tirá-lo de novo. É o sinal
  // mais confiável que o GERID dá: não depende do nome do arquivo nem do texto
  // do rótulo, que foi onde os dois enganos anteriores moraram.
  const lerCaixa = async (): Promise<{ texto: string; remocao: boolean }> => await alvo
    .evaluate((elemento: HTMLElement) => {
      const caixa = elemento.closest('.containerAnexo');
      if (!caixa) return { texto: '', remocao: false };
      const remocao = Array.from(caixa.querySelectorAll('button, a, [role="button"]')).some((controle) => {
        if (!(controle as HTMLElement).getClientRects().length) return false;
        const rotulo = [
          controle.getAttribute('aria-label'),
          controle.getAttribute('title'),
          controle.textContent,
        ].join(' ').toLowerCase();
        return rotulo.includes('excluir') || rotulo.includes('remover');
      });
      return { texto: caixa.textContent || '', remocao };
    })
    .catch(() => ({ texto: '', remocao: false })) as { texto: string; remocao: boolean };

  const inicial = await lerCaixa();
  const antes = compactar(inicial.texto);

  // ⚠️ O robô RETOMA requerimento já aberto, então a caixa pode já ter o
  // arquivo de uma tentativa anterior. Reenviar duplicaria o documento no
  // requerimento de uma pessoa real. Foi o que quase aconteceu no build .10:
  // os seis anexos já tinham entrado na rodada anterior e a conferência, sem
  // saber disso, deu todos como perdidos.
  if (inicial.remocao) return { registrado: true, via: 'ja-estava', detalhe: '' };

  // O nome pode aparecer truncado com reticências na lista do gov.br, então o
  // que se procura é um prefixo do nome, não a string inteira.
  const assinaturas = nomes.map((nome) => compactar(nome).toLowerCase().slice(0, 12)).filter(Boolean);

  // ⚠️ Assinatura que JÁ existia no texto da caixa não prova nada. "Termo de
  // Representação.pdf" vira "termo de rep", que é prefixo do próprio rótulo
  // "Termo de representação da entidade conveniada" — o teste passava com a
  // caixa vazia, e era exatamente esse o anexo que faltava no requerimento.
  const uteis = assinaturas.filter((assinatura) => !antes.toLowerCase().includes(assinatura));

  // Pelo mesmo motivo, o que se lê é só o texto que a caixa GANHOU.
  const soONovo = (agora: string) => (agora.startsWith(antes) ? agora.slice(antes.length) : agora).trim();

  const conferir = async (): Promise<{ mudou: boolean; confere: boolean; novidade: string }> => {
    const limite = Date.now() + 2500;
    let novidade = '';
    while (Date.now() < limite) {
      const agora = await lerCaixa();
      novidade = soONovo(compactar(agora.texto));
      // A lixeira aparecendo já basta. Sem ela e sem assinatura aproveitável,
      // sobra o sinal de que a caixa passou a mostrar algo que antes não
      // mostrava.
      const confere = agora.remocao || (uteis.length
        ? uteis.every((assinatura) => novidade.toLowerCase().includes(assinatura))
        : Boolean(novidade));
      if (confere) return { mudou: true, confere: true, novidade };
      await new Promise((resolva) => setTimeout(resolva, 150));
    }
    return { mudou: Boolean(novidade), confere: false, novidade };
  };

  await alvo.setInputFiles(pacote);
  let veredito = await conferir();
  if (veredito.confere) return { registrado: true, via: 'change', detalhe: '' };

  // Segundo caminho só se a caixa continuou intacta. Se ela já mudou, repetir
  // o envio arriscaria anexar o mesmo documento duas vezes no requerimento —
  // pior do que um aviso pedindo conferência.
  if (!veredito.mudou) {
    // Arrastar e soltar. Reaproveita o FileList que já está no input, então
    // não precisa decodificar o base64 de novo.
    await alvo.evaluate((elemento: HTMLElement) => {
      const input = elemento as HTMLInputElement;
      const transferencia = new DataTransfer();
      for (const arquivo of Array.from(input.files ?? [])) transferencia.items.add(arquivo);
      const area = input.closest('.br-upload') ?? input.closest('.containerAnexo') ?? input.parentElement;
      if (!area) return;
      for (const tipo of ['dragenter', 'dragover', 'drop']) {
        area.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: transferencia }));
      }
    }).catch(() => undefined);

    veredito = await conferir();
    if (veredito.confere) return { registrado: true, via: 'drop', detalhe: '' };
  }

  // Não deu para confirmar. Relato o que a caixa passou a dizer — costuma ser
  // o próprio GERID explicando o motivo — e quantos inputs de arquivo essa
  // caixa tem: mais de um significa que o `.first()` pode ter mirado no campo
  // errado. Dígitos mascarados: nada de dado do requerente no log.
  const forma = await alvo.evaluate((elemento: HTMLElement) => {
    const input = elemento as HTMLInputElement;
    const caixa = input.closest('.containerAnexo');
    return `${input.files?.length ?? 0}/${caixa ? caixa.querySelectorAll('input[type="file"]').length : 0}`;
  }).catch(() => '?/?') as string;
  return {
    registrado: false,
    via: veredito.mudou ? 'mudou-sem-confirmar' : 'nenhum',
    detalhe: `files/inputs=${forma}; caixa diz: "${veredito.novidade.replace(/\d{3,}/g, '###').slice(0, 160)}"`,
  };
}

async function anexarDocumentos(
  page: Page,
  opcoes: OpcoesPreenchimento,
  avisos: string[],
): Promise<Set<string>> {
  // Só entram aqui os slots que o GERID demonstrou ter assumido. Quem decide
  // se o anexo obrigatório está lá é este conjunto, não `input.files`.
  const confirmados = new Set<string>();
  const inputs = page.locator(mapaGerid.passo7.inputArquivo);
  const total = await inputs.count().catch(() => 0);

  if (total !== mapaGerid.passo7.totalSlots) {
    // Informativo de propósito: contar caixa a menos (ou a mais) não quer dizer
    // que algum documento ficou de fora. Cada anexo é conferido um a um logo
    // abaixo, e o que NÃO entrou vira aviso próprio — esse sim bloqueia. Sem a
    // marca, o "Confira" desta frase sozinho já impediu o robô de protocolar um
    // requerimento que estava inteiro.
    avisos.push(avisoInformativo(
      `Esperava ${mapaGerid.passo7.totalSlots} caixas de anexo e encontrei ${total} — ` +
        'o GERID pode ter mudado. Confira os anexos antes de concluir.',
    ));
  }

  const porSlot = new Map<string, ArquivoLocal[]>();
  for (const arq of opcoes.arquivos) {
    const slot = slotGeridDoDocumento(arq.tipo);
    if (!slot) {
      avisos.push(`Documento "${arq.tipo}" não tem caixa mapeada no GERID — anexe manualmente.`);
      continue;
    }

    if (arq.nome && !extensaoAceita(arq.nome)) {
      avisos.push(
        `"${arq.nome}" tem extensão que o GERID não aceita (só .pdf .png .jpg .jpeg .bmp).`,
      );
      continue;
    }

    const grupo = porSlot.get(slot) ?? [];
    grupo.push(arq);
    porSlot.set(slot, grupo);
  }

  for (const [slot, arquivos] of porSlot) {
    const indice = indiceSlotDoDocumento(arquivos[0]?.tipo ?? '');

    let alvo: Locator | null = null;

    // 1) pelo texto do slot — o caminho preferido.
    const caixa = page
      .locator('div.containerAnexo')
      .filter({ hasText: slot })
      .locator('input[type="file"]')
      .first();
    if (await caixa.count()) alvo = caixa;

    // 2) pelo índice conhecido, como rede de segurança.
    if (!alvo && indice !== null && total === mapaGerid.passo7.totalSlots) {
      alvo = inputs.nth(indice);
      avisos.push(`Usei a posição ${indice} para anexar "${slot}" — confira se caiu na caixa certa.`);
    }

    if (!alvo) {
      avisos.push(`Caixa "${slot}" não encontrada — anexe os documentos manualmente.`);
      continue;
    }

    try {
      const conteudos = arquivos.map((arquivo) => arquivo.caminho);
      if (conteudos.some((conteudo) => typeof conteudo === 'string')) {
        throw new Error('Conteúdo do anexo não foi recebido pela extensão.');
      }
      const pacote = conteudos as Array<{ nome: string; mimeType?: string; base64: string }>;
      const entrega = await entregarAnexo(alvo, pacote);
      console.log(`[P7] anexo "${slot}": ${entrega.registrado ? `ok via ${entrega.via}` : `NAO registrou — ${entrega.detalhe}`}`);
      if (entrega.registrado) {
        confirmados.add(slot);
      } else {
        avisos.push(
          `O GERID não registrou ${arquivos.length} arquivo(s) em "${slot}" — anexe manualmente. ` +
            `(${entrega.detalhe})`,
        );
      }
    } catch {
      avisos.push(`Falha ao anexar ${arquivos.length} arquivo(s) em "${slot}" — anexe manualmente.`);
    }
  }

  return confirmados;
}

// ---------------------------------------------------------------------------
// Passos 8 e 9 — unidade e órgão pagador
// ---------------------------------------------------------------------------

async function passo8SelecionarUnidade(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<boolean> {
  await esperarTela(page, /Consultar por CEP|Selecionar Unidade/i);

  // ⚠️ único campo do fluxo sem id.
  const cepPorRotulo = visivel(page.getByLabel(/^CEP$/i)).first();
  const cep = (await cepPorRotulo.isVisible().catch(() => false))
    ? cepPorRotulo
    : visivel(page.getByPlaceholder(mapaGerid.passo8.cepPlaceholder)).first();

  if (!(await cep.isVisible().catch(() => false))) {
    avisos.push('Campo de CEP não encontrado no passo 8 — selecione a unidade manualmente.');
    return false;
  }

  await cep.fill(apenasDigitos(caso.cliente.cep));
  // Campo mascarado ("12.345-678"): conferir o que ficou, conforme o checklist.
  const digitado = apenasDigitos(await cep.inputValue().catch(() => ''));
  if (digitado !== apenasDigitos(caso.cliente.cep)) {
    avisos.push(`O CEP digitado não bateu (esperado ${caso.cliente.cep}, ficou "${digitado}").`);
  }

  await visivel(page.getByRole('button', { name: /^Buscar$/i })).first().click();
  const ok = await selecionarUnidadeDeAtendimento(page, caso, avisos);
  if (ok) await avancar(page, 'passo_8');
  return ok;
}

async function passo9OrgaoPagador(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<boolean> {
  await esperarTela(page, /.rg.o Pagador|receber o benef.cio/i);
  const municipio = cidadeSemUf(caso.cliente.cidade);
  const selecionouMunicipio = await escolherNoCombobox(
    page,
    mapaGerid.passo9.municipio,
    municipio,
  );

  if (!selecionouMunicipio) {
    avisos.push(`Nao encontrei o municipio "${municipio}" na lista de orgao pagador.`);
    return false;
  }

  const marcouAlvo = await marcarPrimeiroRadioDoOrgaoPagador(page);
  if (!marcouAlvo) {
    avisos.push(`Nenhum orgao pagador foi listado para o municipio "${municipio}".`);
    return false;
  }

  const primeiro = page.locator('[data-gerid-rpa-orgao="primeiro"]').first();
  await primeiro.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined);
  if (!(await estaAnexado(primeiro))) {
    avisos.push(`Nenhum orgao pagador foi listado para o municipio "${municipio}".`);
    return false;
  }

  const selecionou = await primeiro
    .check({ force: true })
    .then(() => primeiro.isChecked().catch(() => true), () => false);

  if (!selecionou) {
    avisos.push(`Nao consegui selecionar o primeiro orgao pagador de "${municipio}".`);
    return false;
  }

  await avancar(page, 'passo_9');
  return true;
}

async function marcarPrimeiroRadioDoOrgaoPagador(page: Page): Promise<boolean> {
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    const encontrou = await page.evaluate(() => {
      document.querySelectorAll('[data-gerid-rpa-orgao]').forEach((elemento) => {
        elemento.removeAttribute('data-gerid-rpa-orgao');
      });

      const municipio = document.querySelector<HTMLElement>('#orgaoPagadorMunicipio');
      let escopo = municipio?.parentElement ?? null;
      for (let nivel = 0; escopo && nivel < 10; nivel++, escopo = escopo.parentElement) {
        const radio = escopo.querySelector<HTMLElement>('table tbody input[type="radio"]');
        if (radio) {
          radio.setAttribute('data-gerid-rpa-orgao', 'primeiro');
          return true;
        }
      }
      return false;
    });
    if (encontrou) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

function cidadeSemUf(cidade: string): string {
  return cidade.replace(/\s*[\/-]\s*[A-Za-z]{2}\s*$/u, '').trim();
}

/** Seleciona o card real `.unidade` retornado pela consulta de CEP. */
async function selecionarUnidadeDeAtendimento(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<boolean> {
  const unidades = page.locator(mapaGerid.passo8.cardUnidade);
  await unidades.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);

  const opcoes = await page.evaluate(() => {
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll<HTMLElement>('.unidade')).map((e, indice) => ({
      indice,
      nome: norm(e.querySelector<HTMLElement>('.nome')?.innerText || ''),
      cidade: norm(e.querySelector<HTMLElement>('.municipio')?.innerText || ''),
    }));
  });

  if (opcoes.length === 0) {
    avisos.push('Nenhuma unidade de atendimento foi listada para o CEP informado.');
    return false;
  }

  const alvo = normalizar(cidadeSemUf(caso.cliente.cidade));
  const semUf = (cidade: string) => normalizar(cidade).replace(/\s*-\s*[a-z]{2}$/u, '').trim();
  const exata = opcoes.find((o) => semUf(o.cidade) === alvo);
  const escolhida = exata ?? opcoes[0];
  if (!escolhida) return false;

  if (!exata) {
    avisos.push(
      `O GERID nao listou unidade no municipio "${cidadeSemUf(caso.cliente.cidade)}"; ` +
        `foi usada a primeira unidade regional retornada (${escolhida.nome}).`,
    );
  }

  const card = unidades.nth(escolhida.indice);
  await card.click().catch(() => undefined);
  let selecionou = false;
  const limiteSelecao = Date.now() + 3_000;
  while (!selecionou && Date.now() < limiteSelecao) {
    selecionou = (await card.getAttribute('class'))?.split(/\s+/).includes('selected') ?? false;
    if (!selecionou) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (!selecionou) {
    avisos.push(`Nao consegui selecionar a unidade de atendimento "${escolhida.nome}".`);
    return false;
  }
  return true;
}
