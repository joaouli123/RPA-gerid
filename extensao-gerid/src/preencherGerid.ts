import { MockPage as Page, type Locator } from './playwright-polyfill';
import { ErroGerid, FalhaGerid, type CasoParaProtocolar } from './tiposGerid';
import { apenasDigitos, normalizar } from './domain/texto';
import { mapaGerid, NAVEGACAO } from './mapaGerid';
import {
  RESPOSTAS_FIXAS,
  PERGUNTAS_PASSO7,
  SERVICO_BPC_PCD,
  RESPOSTA_BOLSA_FAMILIA,
  estadoCivilGerid,
  mapearParentesco,
  escolherUnidadePorCidade,
  extrairCidadeDaUnidade,
  slotGeridDoDocumento,
  indiceSlotDoDocumento,
  extensaoAceita,
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
  caminho: string;
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

export async function preencherRequerimento(
  page: Page,
  caso: CasoParaProtocolar,
  opcoes: OpcoesPreenchimento,
): Promise<ResultadoPreenchimento> {
  const avisos: string[] = [];

  await passo1SelecionarServico(page);
  await passo2InformarRequerente(page, caso);
  await passo3AutorizacaoCadUnico(page);
  await passo4GrupoFamiliar(page, caso, avisos);
  await passo5e6Perguntas(page, avisos);
  await passo7DadosRequerente(page, caso, opcoes, avisos);

  // A partir daqui a seleção depende da lista de agências, que ainda não está
  // mapeada. Se o robô não conseguir selecionar, ele PARA na tela — avançar
  // com o campo vazio só produziria um erro de validação do GERID e deixaria o
  // advogado numa tela pior do que a que ele precisa revisar.
  if (!(await passo8SelecionarUnidade(page, caso, avisos))) {
    return { pronto: false, telaAtual: 'Selecionar Unidade', avisos };
  }
  if (!(await passo9OrgaoPagador(page, caso, avisos))) {
    return { pronto: false, telaAtual: 'Órgão Pagador', avisos };
  }

  await esperarTela(page, /Confirmar|Declaro que li/i).catch(() => undefined);
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
  return loc.locator('visible=true');
}

/** Avança usando o id estável — nunca por texto, que existe várias vezes. */
async function avancar(page: Page): Promise<void> {
  await visivel(page.locator(NAVEGACAO.avancar)).first().click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
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
  if (!(await loc.isChecked().catch(() => false))) {
    await loc.check({ force: true });
  }
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
): Promise<boolean> {
  const id = idCombobox.replace(/^#/, '');
  const combo = page.locator(`[id="${id}"]`);
  if (!(await combo.isVisible().catch(() => false))) return false;

  await combo.click().catch(() => undefined);

  const alvo = normalizar(rotuloDesejado);
  const opcoes = page.locator(`[id="${id}-itens"] input[type="radio"]`);
  const total = await opcoes.count().catch(() => 0);

  for (let i = 0; i < total; i++) {
    const radio = opcoes.nth(i);
    const rid = await radio.getAttribute('id');
    if (!rid) continue;

    // O rótulo é lido DENTRO do container, nunca por document-wide `label[for]`:
    // os ids se repetem e a busca global devolveria o rótulo do outro dropdown.
    const texto = await page
      .locator(`[id="${id}-itens"] label[for="${cssEscape(rid)}"]`)
      .innerText()
      .catch(() => '');

    if (normalizar(texto) === alvo) {
      await radio.check({ force: true }).catch(() => undefined);
      return true;
    }
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
  const radio = page.locator(
    `${mapaGerid.passo1.containerOpcoes} input[id="${SERVICO_BPC_PCD.id}"]`,
  );

  if (await radio.count()) {
    await radio.first().check({ force: true });
  } else {
    // Fallback: filtra pelo nome e clica no resultado.
    await visivel(page.locator(mapaGerid.passo1.campoBusca)).first().fill('Assistencial');
    await visivel(page.getByText(SERVICO_BPC_PCD.rotulo, { exact: false })).first().click();
  }

  await avancar(page);
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

  // Confirmado no GERID real: o nome preenche sozinho ao digitar o CPF.
  // Não há lupa nem Enter (o `press('Enter')` do código antigo era inútil).
  // Espera o nome chegar antes de avançar — é a prova de que o CPF foi aceito.
  await visivel(page.locator(mapaGerid.passo2.nome))
    .first()
    .waitFor({ state: 'visible' })
    .catch(() => undefined);

  await avancar(page);
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
  await avancar(page);
}

// ---------------------------------------------------------------------------
// Passo 4 — Grupo Familiar
// ---------------------------------------------------------------------------

/**
 * O GERID já lista as pessoas (vindas do CadÚnico). O robô só marca parentesco
 * e estado civil, casando por CPF com a nossa planilha.
 *
 * Os comboboxes são INDEXADOS por linha (`selectParentesco{i}` /
 * `selectEstadoCivil{i}`), com o requerente sempre no índice 0 — e o índice 0
 * NÃO tem combobox de parentesco.
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

  const porCpf = new Map<string, string>(); // cpf -> parentesco da planilha
  for (const i of caso.grupoFamiliar.integrantes) {
    const c = apenasDigitos(i.cpf ?? '');
    if (c) porCpf.set(c, i.parentesco ?? '');
  }

  // Descobre quantas linhas o GERID renderizou e o CPF de cada uma.
  const linhas = await page.evaluate(() => {
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const out: Array<{ indice: number; cpf: string }> = [];
    for (let i = 0; i < 40; i++) {
      const ec = document.getElementById(`selectEstadoCivil${i}`);
      if (!ec) break;
      let p: HTMLElement | null = ec.parentElement;
      let cpf = '';
      for (let h = 0; p && h < 8; h++, p = p.parentElement) {
        const m = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.exec(norm(p.innerText || ''));
        if (m) {
          cpf = m[0].replace(/\D/g, '');
          break;
        }
      }
      out.push({ indice: i, cpf });
    }
    return out;
  });

  if (linhas.length === 0) {
    avisos.push('O GERID não listou nenhum integrante do grupo familiar — confira o CadÚnico.');
  }

  const vistos = new Set<string>();

  for (const linha of linhas) {
    const ehRequerente = linha.indice === 0;
    if (linha.cpf) vistos.add(linha.cpf);

    // --- Estado civil: existe em TODAS as linhas, inclusive a do requerente.
    const parentescoPlanilha = linha.cpf ? (porCpf.get(linha.cpf) ?? '') : '';
    const estadoCivil = estadoCivilGerid(undefined); // decisão: sempre o padrão
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

    if (!porCpf.has(linha.cpf)) {
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
      // Decisão do escritório: cai em "Outros" em vez de virar pendência —
      // mas sempre avisa, para o advogado conferir na tela de Confirmar.
      avisos.push(
        `CPF ${linha.cpf}: parentesco "${parentescoPlanilha}" não tem opção própria no GERID; ` +
          `marquei "Outros". Confira antes de concluir.`,
      );
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
  if (await nao.count()) {
    await garantirMarcado(nao);
  } else {
    const alt = visivel(page.getByLabel(/^N.o$/i)).last();
    if (await alt.count()) await garantirMarcado(alt);
    else avisos.push('Não achei a opção "Não" de incluir/excluir integrante — marque manualmente.');
  }

  await avancar(page);
}

// ---------------------------------------------------------------------------
// Passos 5 e 6 — perguntas simples
// ---------------------------------------------------------------------------

async function passo5e6Perguntas(page: Page, avisos: string[]): Promise<void> {
  // Passo 5 — Comprometimento de Renda: sempre Não.
  await marcarNaoSimples(page, avisos, 'Comprometimento de Renda');
  await avancar(page);

  // Passo 6 — Proteção Especial SUAS: sempre Não.
  await marcarNaoSimples(page, avisos, 'Proteção Especial SUAS');
  await avancar(page);
}

/**
 * Os passos 5 e 6 não foram capturados no DOM, mas seguem o padrão do passo 4
 * (checkbox `*-Nao` / `*-Sim`). O robô tenta as duas formas conhecidas e, se
 * nenhuma funcionar, avisa em vez de travar — a resposta é sempre "Não" e o
 * advogado consegue marcar em um clique na revisão.
 */
async function marcarNaoSimples(page: Page, avisos: string[], tela: string): Promise<void> {
  const porId = visivel(page.locator('input[id$="-Nao"]')).last();
  if (await porId.count()) {
    await garantirMarcado(porId);
    return;
  }
  const porRotulo = visivel(page.getByLabel(/^N.o$/i)).last();
  if (await porRotulo.count()) {
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
): Promise<void> {
  await esperarTela(page, /Dados Adicionais|Interessados/i);

  // --- Contatos
  const telefone = caso.cliente.telefone?.trim() || opcoes.telefonePadrao;
  await adicionarContato(page, 'Celular', telefone, avisos);
  await adicionarContato(page, 'E-mail', opcoes.emailEscritorio, avisos);

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
  }

  // --- CPF do procurador
  const cpfProc = visivel(page.getByLabel(/CPF do Procurador/i)).first();
  if (await cpfProc.count()) {
    await cpfProc.fill(apenasDigitos(opcoes.procuradorCpf));
  } else {
    avisos.push('Campo "CPF do Procurador" não encontrado — preencha manualmente.');
  }

  // --- Checkboxes de ciência.
  // ⚠️ O código antigo marcava TODOS os checkboxes da página, às cegas. Agora
  // só marca os que começam com "campo-", que é o padrão do GERID para
  // checkbox de campo (confirmado no DOM). Nada de marcar declaração por acaso.
  const ciencias = visivel(page.locator('input[type="checkbox"][id^="campo-"]'));
  const totalCiencias = await ciencias.count().catch(() => 0);
  for (let i = 0; i < totalCiencias; i++) {
    await garantirMarcado(ciencias.nth(i));
  }

  await anexarDocumentos(page, opcoes, avisos);
  await avancar(page);
}

async function adicionarContato(
  page: Page,
  tipo: string,
  valor: string,
  avisos: string[],
): Promise<void> {
  if (!valor) {
    avisos.push(`Contato ${tipo} não informado — adicione manualmente.`);
    return;
  }
  try {
    await visivel(page.getByText(/Adicionar/i)).first().click();
    const ok = await escolherNoCombobox(page, mapaGerid.passo7.tipoContato, tipo);
    if (!ok) avisos.push(`Não consegui escolher o tipo de contato "${tipo}".`);
    await visivel(page.getByLabel(/^Valor/i)).first().fill(valor);
    await visivel(page.getByRole('button', { name: /^Adicionar$/i })).first().click();
    await visivel(page.getByRole('button', { name: /Fechar/i })).first().click();
  } catch {
    avisos.push(`Falhei ao adicionar o contato ${tipo} (${valor}) — adicione manualmente.`);
  }
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

    const indice = indiceSlotDoDocumento(arq.tipo);
    let alvo: Locator | null = null;

    // 1) pelo texto do slot — o caminho preferido.
    const caixa = page
      .locator('div')
      .filter({ hasText: slot })
      .locator('input[type="file"]')
      .last();
    if (await caixa.count()) alvo = caixa;

    // 2) pelo índice conhecido, como rede de segurança.
    if (!alvo && indice !== null && total === mapaGerid.passo7.totalSlots) {
      alvo = inputs.nth(indice);
      avisos.push(`Usei a posição ${indice} para anexar "${slot}" — confira se caiu na caixa certa.`);
    }

    if (!alvo) {
      avisos.push(`Caixa "${slot}" não encontrada — anexe ${arq.tipo} manualmente.`);
      continue;
    }

    try {
      await alvo.setInputFiles(arq.caminho);
    } catch {
      avisos.push(`Falha ao anexar ${arq.tipo} em "${slot}" — anexe manualmente.`);
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
  const cep =
    (await visivel(page.getByLabel(/^CEP$/i)).count())
      ? visivel(page.getByLabel(/^CEP$/i)).first()
      : visivel(page.getByPlaceholder(mapaGerid.passo8.cepPlaceholder)).first();

  if (!(await cep.count())) {
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
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const ok = await escolherUnidadeDaCidade(page, caso, avisos, 'unidade de atendimento');
  if (ok) await avancar(page);
  return ok;
}

async function passo9OrgaoPagador(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<boolean> {
  await esperarTela(page, /.rg.o Pagador|receber o benef.cio/i);
  const ok = await escolherUnidadeDaCidade(page, caso, avisos, 'órgão pagador');
  if (ok) await avancar(page);
  return ok;
}

/**
 * Lê a lista de unidades e identifica a da cidade do cliente.
 *
 * A cidade vem sempre no padrão `CIDADE-UF` logo antes de `CEP:` — por isso a
 * comparação usa a cidade extraída, e não o texto inteiro da linha (que inclui
 * o endereço e fazia o robô escolher agência de outra cidade cujo logradouro
 * citasse a cidade do cliente).
 *
 * ⚠️ PENDÊNCIA CONHECIDA: ainda não sabemos qual elemento representa cada
 * agência (não são radio, button, a, li nem td). O robô identifica a agência
 * correta e tenta selecioná-la; se não conseguir, AVISA e segue — o advogado
 * escolhe na revisão. Nunca clica no escuro.
 */
async function escolherUnidadeDaCidade(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
  rotuloEtapa: string,
): Promise<boolean> {
  const linhas = await page.evaluate(() => {
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const RE = /CEP:\s*\d{2}\.\d{3}-\d{3}/;
    const todos = Array.from(document.querySelectorAll<HTMLElement>('*'));
    return todos
      .filter((e) => {
        const t = norm(e.innerText || '');
        if (!RE.test(t) || t.length > 250) return false;
        return !Array.from(e.children).some((c) =>
          RE.test(norm((c as HTMLElement).innerText || '')),
        );
      })
      .map((e, i) => ({ indice: i, texto: norm(e.innerText || '') }));
  });

  if (linhas.length === 0) {
    avisos.push(`Nenhuma ${rotuloEtapa} foi listada — selecione manualmente.`);
    return false;
  }

  const opcoes = linhas.map((l) => ({
    nome: l.texto,
    cidade: extrairCidadeDaUnidade(l.texto) ?? undefined,
    indice: l.indice,
  }));

  const escolhida = escolherUnidadePorCidade(opcoes, caso.cliente.cidade);

  if (!escolhida) {
    const cidades = opcoes.map((o) => o.cidade ?? '?').join(', ');
    avisos.push(
      `Nenhuma ${rotuloEtapa} da cidade "${caso.cliente.cidade}" na lista (opções: ${cidades}). ` +
        'Escolha manualmente antes de concluir.',
    );
    return false;
  }

  // Tenta selecionar. Enquanto o elemento clicável não estiver mapeado, isto
  // pode não surtir efeito — por isso a confirmação explícita logo abaixo.
  const radio = visivel(page.locator('input[type="radio"]')).nth(escolhida.indice);
  const selecionou =
    (await radio.count()) > 0 && (await radio.check({ force: true }).then(() => true, () => false));

  if (!selecionou) {
    avisos.push(
      `Identifiquei a ${rotuloEtapa} correta ("${escolhida.cidade}") mas não consegui selecioná-la: ` +
        'a lista do GERID ainda não está mapeada. Selecione essa opção manualmente.',
    );
    return false;
  }
  return true;
}
