import { MockPage as Page, type Locator } from './playwright-polyfill';
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
} from './regrasPreenchimento';

/**
 * PREENCHIMENTO DO REQUERIMENTO NO GERID — passos 1 a 9, parando no Confirmar.
 *
 * Seletores capturados do DOM real em 28/07/2026 (docs/gerid-mapeamento-real.md).
 *
 * Decisão de arquitetura (humano no laço): o robô preenche e **para na tela de
 * Confirmar**. Quem revisa e conclui é o advogado — nenhum requerimento é
 * enviado ao INSS pelo robô. Esta função não marca a declaração final nem
 * clica em "Gerar Comprovante".
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

export async function preencherRequerimento(
  page: Page,
  caso: CasoParaProtocolar,
  opcoes: OpcoesPreenchimento,
  relatarTempo: RelatarTempoEtapa = () => undefined,
): Promise<ResultadoPreenchimento> {
  const avisos: string[] = [];

  await executarEtapa('1 - servico', () => passo1SelecionarServico(page), relatarTempo);
  await executarEtapa('2 - requerente', () => passo2InformarRequerente(page, caso), relatarTempo);
  await executarEtapa('3 - CadUnico', () => passo3AutorizacaoCadUnico(page), relatarTempo);
  await executarEtapa('4 - grupo familiar', () => passo4GrupoFamiliar(page, caso, avisos), relatarTempo);
  await executarEtapa('5/6 - declaracoes', () => passo5e6Perguntas(page, avisos), relatarTempo);
  if (!(await executarEtapa(
    '7 - dados e anexos',
    () => passo7DadosRequerente(page, caso, opcoes, avisos),
    relatarTempo,
  ))) {
    return { pronto: false, telaAtual: 'Dados do Requerente', avisos };
  }

  // As etapas 8 e 9 usam os componentes reais do GERID: cards `.unidade` e
  // municipio + radio de orgao pagador. Se o portal mudar esses contratos, o
  // robo para na etapa afetada em vez de avancar com um campo vazio.
  if (!(await executarEtapa(
    '8 - unidade',
    () => passo8SelecionarUnidade(page, caso, avisos),
    relatarTempo,
  ))) {
    return { pronto: false, telaAtual: 'Selecionar Unidade', avisos };
  }
  if (!(await executarEtapa(
    '9 - orgao pagador',
    () => passo9OrgaoPagador(page, caso, avisos),
    relatarTempo,
  ))) {
    return { pronto: false, telaAtual: 'Órgão Pagador', avisos };
  }

  await esperarTela(page, /Confirmar|Declaro que li/i);
  return { pronto: true, telaAtual: 'Confirmar', avisos };
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
  throw new ErroGerid(
    FalhaGerid.ERRO_PREENCHIMENTO,
    `O GERID não saiu de ${etapaAtual} após validar os dados. ${contexto}`,
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
async function escolherNoCombobox(
  page: Page,
  idCombobox: string,
  rotuloDesejado: string,
  aceitarTextoAdicional = false,
): Promise<boolean> {
  const idNoSeletor = idCombobox.match(/\[id="([^"]+)"\]/)?.[1];
  const id = idNoSeletor ?? idCombobox.replace(/^#/, '');
  const combo = page.locator(`[id="${id}"]`);
  if (!(await combo.isVisible().catch(() => false))) return false;

  const alvo = normalizar(rotuloDesejado);

  // As opcoes continuam anexadas ao DOM mesmo com a lista recolhida. Tente
  // primeiro o contrato React do componente, sem depender de coordenadas,
  // foco, animacao ou velocidade de abertura do dropdown.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (await acionarControleReactNaPagina('combobox', id, rotuloDesejado)) {
      if (await aguardarValorCombobox(combo, alvo, 1_500)) return true;
    }
    if (tentativa === 0) {
      await combo.click().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const rotulos = page.locator(`[id="${id}-itens"] label`);
  let total = await rotulos.count().catch(() => 0);
  if (total === 0) {
    await combo.click().catch(() => undefined);
    const limite = Date.now() + 2_000;
    while (total === 0 && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      total = await rotulos.count().catch(() => 0);
    }
  }

  for (let i = 0; i < total; i++) {
    const rotulo = rotulos.nth(i);

    // O rótulo é lido DENTRO do container, nunca por document-wide `label[for]`:
    // os ids se repetem e a busca global devolveria o rótulo do outro dropdown.
    const texto = await rotulo.innerText().catch(() => '');

    const textoNormalizado = normalizar(texto);
    if (textoNormalizado === alvo || (aceitarTextoAdicional && textoNormalizado.includes(alvo))) {
      if (await acionarControleReactNaPagina('combobox', id, rotuloDesejado)) {
        if (await aguardarValorCombobox(combo, alvo, 1_000)) return true;
      }

      await ativarOpcaoCombobox(rotulo).catch(() => undefined);
      if (await aguardarValorCombobox(combo, alvo, 150)) return true;

      const rid = await rotulo.getAttribute('for');
      if (rid) {
        const radio = page
          .locator(`[id="${id}-itens"] input[id="${cssEscape(rid)}"]`)
          .first();
        await radio.check({ force: true }).catch(() => undefined);
        if (await aguardarValorCombobox(combo, alvo, 2_000)) return true;
        // O radio interno pode ficar marcado por alguns milissegundos sem o
        // React aceitar a opcao. So o valor visivel confirma a selecao.
      }
      return false;
    }
  }
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
 * Localiza o id de um combobox pela PERGUNTA visível ao lado dele.
 *
 * No passo 7 os ids são hash (`ca-<md5>`) — id gerado não é contrato, então o
 * robô ancora no texto. Esta é a mesma lógica usada na sessão de captura, o
 * que garante que runtime e mapeamento enxergam a tela do mesmo jeito.
 */
async function comboPorPergunta(page: Page, trechoPergunta: string): Promise<string | null> {
  return page.evaluate((trecho) => {
    const norm = (s: string) =>
      (s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const alvo = norm(trecho);

    const combos = Array.from(
      document.querySelectorAll<HTMLElement>('[id^="ca-"]:not([id$="-itens"])'),
    );
    for (const c of combos) {
      let p: HTMLElement | null = c.parentElement;
      for (let h = 0; p && h < 6; h++, p = p.parentElement) {
        const texto = norm(p.innerText || '');
        if (texto.length > 10 && texto.length < 400 && texto.includes(alvo)) return c.id;
      }
    }
    return null;
  }, trechoPergunta);
}

/** Localiza um input de texto sem rótulo `for`, usando a pergunta ao redor. */
async function inputPorPergunta(page: Page, trechoPergunta: string): Promise<string | null> {
  return page.evaluate((trecho) => {
    const norm = (s: string) =>
      (s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const alvo = norm(trecho);

    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input:not([role="combobox"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
      ),
    );
    for (const input of inputs) {
      let p: HTMLElement | null = input.parentElement;
      for (let h = 0; p && h < 5; h++, p = p.parentElement) {
        const texto = norm(p.innerText || '');
        if (texto.length > 3 && texto.length < 250 && texto.includes(alvo)) return input.id;
      }
    }
    return null;
  }, trechoPergunta);
}

/** Responde um combobox do passo 7 localizado pela pergunta. Vira aviso se falhar. */
async function responderPergunta(
  page: Page,
  trechoPergunta: string,
  resposta: string,
  avisos: string[],
  opcional = false
): Promise<void> {
  const id = await comboPorPergunta(page, trechoPergunta);
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
  await verificarBloqueioDePedidoAberto(page);
}

/** O GERID bloqueia um novo BPC quando o requerente ja possui pedido aberto. */
async function verificarBloqueioDePedidoAberto(page: Page): Promise<void> {
  const alerta = page.locator('[role="alert"]');
  if (!(await alerta.isVisible().catch(() => false))) return;

  const mensagem = await alerta.innerText().catch(() => '');
  if (/n..o e poss.vel continuar|pedido\s+\d+\s+.*em aberto/i.test(mensagem)) {
    throw new ErroGerid(
      FalhaGerid.ERRO_PREENCHIMENTO,
      `O GERID bloqueou este requerente por existir pedido em aberto. ${mensagem}`,
    );
  }
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
    const c = apenasDigitos(i.cpf ?? '');
    if (c) porCpf.set(c, i);
  }
  const cpfRequerente = apenasDigitos(caso.grupoFamiliar.requerenteCpf ?? caso.cliente.cpf);
  const titularPlanilha = porCpf.get(cpfRequerente)
    ?? caso.grupoFamiliar.integrantes.find((i) =>
      ['titular', 'requerente'].includes(normalizar(i.parentesco ?? '')),
    );

  // Descobre quantas linhas o GERID renderizou e o CPF de cada uma.
  const linhas = await page.evaluate(() => {
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const out: Array<{ indice: number; cpf: string; ehRequerente: boolean }> = [];
    for (let i = 0; i < 40; i++) {
      const ec = document.getElementById(`selectEstadoCivil${i}`);
      if (!ec) break;
      const tr = ec.closest('tr') as HTMLElement | null;
      const primeiraCelula = tr?.querySelector('td') as HTMLElement | null;
      const digitos = norm(primeiraCelula?.innerText || '').replace(/\D/g, '');
      // O GERID remove o zero inicial e exibe 032... como 320... (10 dígitos).
      const cpf = digitos.length === 10 ? digitos.padStart(11, '0') : digitos;
      const ehRequerente = !document.getElementById(`selectParentesco${i}`);
      out.push({ indice: i, cpf, ehRequerente });
    }
    return out;
  });

  if (linhas.length === 0) {
    avisos.push('O GERID não listou nenhum integrante do grupo familiar — confira o CadÚnico.');
  }

  const vistos = new Set<string>();

  for (const linha of linhas) {
    const ehRequerente = linha.ehRequerente;
    if (linha.cpf) vistos.add(linha.cpf);

    // --- Estado civil: existe em TODAS as linhas, inclusive a do requerente.
    const integrantePlanilha = (linha.cpf ? porCpf.get(linha.cpf) : undefined)
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
        `CPF ${linha.cpf} veio do CadÚnico mas não está na planilha — confira o parentesco.`,
      );
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
      avisos.push(`CPF ${linha.cpf}: parentesco "${parentescoPlanilha}" ${decisao}. Confira antes de concluir.`);
    }
  }

  // Integrantes da planilha que o CadÚnico não trouxe.
  for (const cpf of porCpf.keys()) {
    if (!vistos.has(cpf)) {
      avisos.push(`CPF ${cpf} está na planilha mas o GERID não listou — divergência com o CadÚnico.`);
    }
  }

  // "Há alguém que você queira incluir ou excluir?" -> sempre Não.
  // ⚠️ São CHECKBOXES (`undefined-Nao`), não botões — o código antigo procurava
  // por getByRole('button') e falharia aqui.
  const nao = visivel(page.locator(mapaGerid.passo4.incluirExcluirNao)).first();
  if (await existeInputNoDom(nao)) {
    await garantirMarcado(nao);
  } else {
    const alt = visivel(page.getByLabel(/^N.o$/i)).last();
    if (await existeInputNoDom(alt)) await garantirMarcado(alt);
    else avisos.push('Não achei a opção "Não" de incluir/excluir integrante — marque manualmente.');
  }

  await avancar(page, 'passo_4');
}

async function aguardarGrupoFamiliarEstavel(page: Page, totalEsperado: number): Promise<void> {
  const limite = Date.now() + 5_000;
  let assinaturaAnterior = '';
  let estavelDesde = 0;

  while (Date.now() < limite) {
    const atual = await page.evaluate(() => {
      const controles = Array.from(document.querySelectorAll<HTMLInputElement>('[id^="selectEstadoCivil"]'));
      return controles
        .map((controle) => {
          const linha = controle.closest('tr');
          const cpf = linha?.querySelector<HTMLElement>('td')?.innerText.replace(/\D/g, '') ?? '';
          return `${controle.id}:${cpf}`;
        })
        .join('|');
    });
    const totalAtual = atual ? atual.split('|').length : 0;

    if (atual !== assinaturaAnterior) {
      assinaturaAnterior = atual;
      estavelDesde = Date.now();
    }
    if (totalAtual >= Math.max(1, totalEsperado) && Date.now() - estavelDesde >= 250) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
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

  // --- Perguntas fixas, localizadas pelo texto (os ids são hash)
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
  const cpfProcId = await inputPorPergunta(page, 'CPF do Procurador');
  if (cpfProcId) {
    const cpfProcurador = visivel(page.locator(`[id="${cssEscape(cpfProcId)}"]`)).first();
    await cpfProcurador.fill(apenasDigitos(opcoes.procuradorCpf));
    if (apenasDigitos(await cpfProcurador.inputValue().catch(() => '')) !== apenasDigitos(opcoes.procuradorCpf)) {
      avisos.push('O GERID não confirmou o CPF do procurador — preencha manualmente.');
      return false;
    }
  } else {
    avisos.push('Campo "CPF do Procurador" não encontrado — preencha manualmente.');
    return false;
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

  const perguntasPendentes = listarPerguntasObrigatoriasPendentes();
  if (perguntasPendentes.length) {
    avisos.push(
      `O GERID deixou ${perguntasPendentes.length} pergunta(s) obrigatória(s) sem resposta: ` +
      perguntasPendentes.join(' | '),
    );
    return false;
  }

  await anexarDocumentos(page, opcoes, avisos);
  const slotsObrigatorios = SLOTS_GERID.filter((slot) => slot.obrigatorio);
  const anexosObrigatoriosAusentes: string[] = [];
  for (const slot of slotsObrigatorios) {
    const input = page.locator(mapaGerid.passo7.inputArquivo).nth(slot.indice);
    const quantidade = await input.evaluate((elemento: HTMLInputElement) => elemento.files?.length ?? 0)
      .catch(() => 0) as number;
    if (quantidade === 0) anexosObrigatoriosAusentes.push(slot.rotulo);
  }
  if (anexosObrigatoriosAusentes.length) {
    avisos.push(`Anexos obrigatórios não confirmados: ${anexosObrigatoriosAusentes.join(' | ')}`);
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
    await campoValor.fill(valor);

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
    if (!confirmou) throw new Error(`O GERID não exibiu o contato ${tipo} depois de adicionar.`);

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

async function contatoExisteNoDialogo(page: Page, tipo: string, valor: string): Promise<boolean> {
  return page.evaluate(({ tipoEsperado, valorEsperado }) => {
    const normalizarTexto = (entrada: string) => entrada.replace(/\s+/g, ' ').trim().toLowerCase();
    const soDigitos = (entrada: string) => entrada.replace(/\D/g, '');
    const contatos = document.querySelector<HTMLElement>('#contatos');
    if (!contatos) return false;
    return Array.from(contatos.querySelectorAll<HTMLElement>('tbody tr')).some((linha) => {
      const texto = normalizarTexto(linha.innerText);
      const tipoOk = texto.includes(normalizarTexto(tipoEsperado));
      const valorOk = tipoEsperado.toLowerCase().includes('mail')
        ? texto.includes(normalizarTexto(valorEsperado))
        : soDigitos(texto).includes(soDigitos(valorEsperado));
      return tipoOk && valorOk;
    });
  }, { tipoEsperado: tipo, valorEsperado: valor });
}

/**
 * Anexa cada documento na CAIXA nomeada certa.
 *
 * Os 11 `input[type=file]` compartilham `id="single-file"`, então a caixa é
 * localizada pelo TEXTO do slot; o índice conhecido (0-10) serve de conferência
 * cruzada, já que a ordem é estável.
 */
async function anexarDocumentos(
  page: Page,
  opcoes: OpcoesPreenchimento,
  avisos: string[],
): Promise<void> {
  const inputs = page.locator(mapaGerid.passo7.inputArquivo);
  const total = await inputs.count().catch(() => 0);

  if (total !== mapaGerid.passo7.totalSlots) {
    avisos.push(
      `Esperava ${mapaGerid.passo7.totalSlots} caixas de anexo e encontrei ${total} — ` +
        'o GERID pode ter mudado. Confira os anexos antes de concluir.',
    );
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
      await alvo.setInputFiles(conteudos as Array<{ nome: string; mimeType?: string; base64: string }>);
      const nomesRecebidos = await alvo.evaluate((input: HTMLInputElement) =>
        Array.from(input.files ?? []).map((arquivo) => arquivo.name),
      ) as string[];
      const nomesEsperados = arquivos.map((arquivo) => arquivo.nome).filter(Boolean) as string[];
      if (
        nomesRecebidos.length !== arquivos.length ||
        nomesEsperados.some((nome) => !nomesRecebidos.includes(nome))
      ) {
        throw new Error('O GERID não preservou todos os arquivos selecionados.');
      }
    } catch {
      avisos.push(`Falha ao anexar ${arquivos.length} arquivo(s) em "${slot}" — anexe manualmente.`);
    }
  }
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
