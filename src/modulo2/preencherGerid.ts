import type { Locator, Page } from 'playwright';
import { ErroGerid, FalhaGerid, type CasoParaProtocolar } from './tiposGerid';
import { apenasDigitos } from '../domain/texto';
import {
  RESPOSTAS_FIXAS,
  formaDeConvivio,
  estadoCivilGerid,
  mapearParentesco,
  escolherUnidadePorCidade,
  slotGeridDoDocumento,
} from './regrasPreenchimento';

/**
 * PREENCHIMENTO DO REQUERIMENTO NO GERID — passos 1 a 9, parando no Confirmar.
 *
 * ⚠️ RASCUNHO A VALIDAR. Os seletores aqui vieram das TELAS (prints do
 * Fabrício, 23/07/2026 — ver docs/gerid-fluxo-real.md), não do HTML ao vivo.
 * Eles precisam ser conferidos numa sessão acompanhada, com o GERID logado,
 * antes de confiar. Onde a incerteza é maior, está marcado `VALIDAR`.
 *
 * Decisão de arquitetura (humano no laço): o robô preenche tudo e **para na
 * tela de Confirmar**. Quem revisa e clica em concluir é o advogado — nenhum
 * requerimento é enviado ao INSS pelo robô. Por isso esta função NÃO clica na
 * declaração final nem em "Gerar Comprovante".
 */

export interface ArquivoLocal {
  /** Tipo do documento (TERMO_REPRESENTACAO, DOCUMENTOS_MEDICOS, ...). */
  tipo: string;
  /** Caminho no disco local do arquivo já baixado do Drive. */
  caminho: string;
}

export interface OpcoesPreenchimento {
  /** CPF do procurador (o advogado logado). */
  procuradorCpf: string;
  /** Telefone de contato; usa o do escritório quando o cliente não tem. */
  telefonePadrao: string;
  /** E-mail de contato do escritório. */
  emailEscritorio: string;
  /**
   * Arquivos do cliente JÁ BAIXADOS para o disco local, com o tipo de cada um.
   * O upload do GERID é por caixa nomeada, então cada tipo vai no slot certo.
   * (O download do Drive é feito por quem chama — o Playwright só anexa o arquivo.)
   */
  arquivos: ArquivoLocal[];
}

export interface ResultadoPreenchimento {
  /** true se chegou à tela Confirmar sem erro. */
  pronto: boolean;
  /** Nome da tela onde o robô parou. */
  telaAtual: string;
  /**
   * Coisas que o humano precisa conferir/completar na revisão: parentesco não
   * resolvido, integrante do CadÚnico sem correspondência na planilha, slot de
   * documento não encontrado, etc. Nunca é "erro fatal" — é lista de conferência.
   */
  avisos: string[];
}

const NOME_SERVICO = 'Benefício Assistencial à Pessoa com Deficiência';

/**
 * Preenche o requerimento de BPC/LOAS até a tela de Confirmar.
 * Lança ErroGerid(CAMPO_NAO_ENCONTRADO) quando uma tela esperada não aparece —
 * nunca segue às cegas.
 */
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
  await passo5e6Perguntas(page);
  await passo7DadosRequerente(page, caso, opcoes, avisos);
  await passo8SelecionarUnidade(page, caso, avisos);
  await passo9OrgaoPagador(page, caso, avisos);

  // Chega ao Confirmar (passo 10) e PARA. Não marca a declaração nem conclui.
  await esperarTela(page, /Atendimento à Distância|Confirmar|Dados do Requerente/i);

  return { pronto: true, telaAtual: 'Confirmar', avisos };
}

// ---------------------------------------------------------------------------
// Helpers de navegação
// ---------------------------------------------------------------------------

/** Clica no botão "Avançar" e espera a próxima tela assentar. */
async function avancar(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Avançar/i }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/**
 * Espera um texto/título aparecer na tela — é como o robô confirma que está no
 * passo certo antes de preencher. Falha com CAMPO_NAO_ENCONTRADO se não vier.
 */
async function esperarTela(page: Page, marca: RegExp): Promise<void> {
  try {
    await page.getByText(marca).first().waitFor({ state: 'visible' });
  } catch {
    throw new ErroGerid(
      FalhaGerid.CAMPO_NAO_ENCONTRADO,
      `Não encontrei a tela esperada (${marca}). O layout do GERID pode ter mudado — validar seletores.`,
    );
  }
}

/** Marca um checkbox se ainda não estiver marcado. */
async function garantirMarcado(loc: Locator): Promise<void> {
  if (!(await loc.isChecked().catch(() => false))) {
    await loc.check();
  }
}

/** Responde uma pergunta Não/Sim (os botões cinza do GERID). */
async function responderNaoSim(page: Page, textoPergunta: RegExp, resposta: 'Não' | 'Sim'): Promise<void> {
  // O par de botões fica logo após o texto da pergunta.
  const bloco = page.locator('div', { hasText: textoPergunta }).last();
  const botao = bloco.getByRole('button', { name: new RegExp(`^${resposta}$`) }).last();
  await botao.click();
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

async function passo1SelecionarServico(page: Page): Promise<void> {
  // Da tela inicial (Tarefas) para o assistente.
  await page.getByRole('button', { name: /Novo Requerimento/i }).click();
  await esperarTela(page, /Seleção de Serviços|Selecionar Serviço/i);

  // Combobox "Serviço": digita e escolhe a opção do BPC/PcD.
  const servico = page.getByLabel(/Serviço/i).first();
  await servico.click();
  await servico.fill('BENEFICIO ASSIS'); // VALIDAR: pode ser input separado do combobox
  await page.getByText(NOME_SERVICO, { exact: false }).first().click();

  await avancar(page); // tela de informações do serviço
  await esperarTela(page, /Informações do Serviço|Benefício Assistencial/i).catch(() => undefined);
  await avancar(page);
}

async function passo2InformarRequerente(page: Page, caso: CasoParaProtocolar): Promise<void> {
  await esperarTela(page, /Dados do Requerente|Informar Requerente/i);

  const cpf = apenasDigitos(caso.cliente.cpf);
  const campoCpf = page.getByLabel(/^CPF/i).first();
  await campoCpf.fill(cpf);
  // Buscar dispara a consulta que preenche Nome (e às vezes a data). Pode ser um
  // botão de lupa ou Enter — VALIDAR qual dispara no GERID real.
  await campoCpf.press('Enter').catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await avancar(page);
}

async function passo3AutorizacaoCadUnico(page: Page): Promise<void> {
  await esperarTela(page, /Autorização de Uso de Dados|Autorização CadÚnico/i);
  // Único checkbox da tela: autoriza o uso dos dados do CadÚnico.
  await garantirMarcado(page.getByRole('checkbox').first());
  await avancar(page);
}

async function passo4GrupoFamiliar(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<void> {
  await esperarTela(page, /Grupo Familiar|Nome do Familiar/i);

  // O GERID já traz as pessoas do CadÚnico. Para cada linha, casa pelo CPF com
  // a nossa planilha e escolhe Parentesco + Estado Civil.
  const linhas = page.locator('tr, [role="row"]').filter({ hasText: /\d{3}\.?\d{3}\.?\d{3}/ });
  const total = await linhas.count();

  // Índice dos nossos integrantes por CPF, para casar por CPF.
  const porCpf = new Map(
    caso.grupoFamiliar.integrantes.map((i) => [apenasDigitos(i.cpf), i]),
  );

  for (let i = 0; i < total; i++) {
    const linha = linhas.nth(i);
    const textoLinha = (await linha.innerText()).replace(/\s+/g, ' ');
    const cpfLinha = apenasDigitos((textoLinha.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/) ?? [''])[0]);

    const selects = linha.getByRole('combobox');
    const qtdSelects = await selects.count();

    const nosso = porCpf.get(cpfLinha);
    const ehRequerente = cpfLinha === apenasDigitos(caso.cliente.cpf);

    // Estado civil (sempre presente). Padrão Solteiro; muda só se a planilha disser.
    const estadoCivil = estadoCivilGerid(nosso?.estadoCivil);
    // O select de estado civil é o último da linha (o de parentesco vem antes).
    await selects
      .nth(qtdSelects - 1)
      .selectOption({ label: estadoCivil })
      .catch(() => avisos.push(`Estado civil "${estadoCivil}" não encontrado para o CPF ${cpfLinha}.`));

    if (ehRequerente) continue; // o requerente já vem como "Requerente" fixo

    // Parentesco: traduz para o grupo do GERID; se não resolver, deixa para o humano.
    const parentesco = mapearParentesco(nosso?.parentesco ?? '');
    if (!parentesco.grupo) {
      avisos.push(
        `Parentesco do CPF ${cpfLinha} não definido — escolha na revisão (a planilha só tinha o CPF).`,
      );
    } else {
      if (!parentesco.confirmado) {
        avisos.push(`Confira o parentesco do CPF ${cpfLinha}: usei "${parentesco.grupo}" (a validar).`);
      }
      await selects
        .nth(0)
        .selectOption({ label: parentesco.grupo })
        .catch(() =>
          avisos.push(`Parentesco "${parentesco.grupo}" não encontrado para o CPF ${cpfLinha}.`),
        );
    }

    if (!nosso) {
      avisos.push(`CPF ${cpfLinha} veio do CadÚnico mas não está na planilha — confira.`);
    }
  }

  // "Há alguém a incluir ou excluir desta lista?" -> Não (a lista do CadÚnico vale).
  await responderNaoSim(page, /incluir ou excluir desta lista/i, 'Não').catch(() =>
    avisos.push('Não achei o botão Não/Sim de incluir/excluir no grupo familiar — confira.'),
  );

  await avancar(page);
}

async function passo5e6Perguntas(page: Page): Promise<void> {
  // Passo 5 — Comprometimento de Renda.
  await esperarTela(page, /Comprometimento de Renda|comprometam a renda/i);
  await responderNaoSim(page, /comprometam a renda/i, RESPOSTAS_FIXAS.comprometimentoDeRenda);
  await avancar(page);

  // Passo 6 — Proteção Especial SUAS.
  await esperarTela(page, /Proteção Especial|Serviço de Proteção Especial/i);
  await responderNaoSim(page, /Serviço de Proteção Especial/i, RESPOSTAS_FIXAS.protecaoEspecialSuas);
  await avancar(page);
}

async function passo7DadosRequerente(
  page: Page,
  caso: CasoParaProtocolar,
  opcoes: OpcoesPreenchimento,
  avisos: string[],
): Promise<void> {
  await esperarTela(page, /Interessados|Dados Adicionais/i);

  // --- Contatos (modal "Adicionar") ---
  const telefone = caso.cliente.telefone?.trim() || opcoes.telefonePadrao;
  await adicionarContato(page, 'Celular', telefone).catch(() =>
    avisos.push('Não consegui adicionar o telefone de contato — confira.'),
  );
  await adicionarContato(page, 'E-mail', opcoes.emailEscritorio).catch(() =>
    avisos.push('Não consegui adicionar o e-mail de contato — confira.'),
  );

  // --- Aceita acompanhar o processo -> Sim ---
  await responderNaoSim(page, /acompanhar o andamento/i, RESPOSTAS_FIXAS.acompanhaProcesso).catch(
    () => undefined,
  );

  // --- Dados Adicionais (selects rotulados) ---
  await selecionarPorRotulo(page, /estrangeiro em situação regular/i, RESPOSTAS_FIXAS.estrangeiro, avisos);
  await selecionarPorRotulo(page, /Representante Legal/i, RESPOSTAS_FIXAS.representanteLegal, avisos);
  await selecionarPorRotulo(page, /cadastrar Procurador/i, RESPOSTAS_FIXAS.procurador, avisos);

  // CPF do Procurador (aparece após escolher Procurador = Sim).
  await page
    .getByLabel(/CPF do Procurador/i)
    .fill(apenasDigitos(opcoes.procuradorCpf))
    .catch(() => avisos.push('Campo "CPF do Procurador" não encontrado — confira.'));

  await selecionarPorRotulo(page, /Onde você mora/i, RESPOSTAS_FIXAS.ondeMora, avisos);
  await selecionarPorRotulo(page, /Forma de Convívio/i, formaDeConvivio(caso.grupoFamiliar), avisos);
  await selecionarPorRotulo(page, /Recebe algum tipo de benefício/i, RESPOSTAS_FIXAS.recebeBeneficio, avisos);
  await selecionarPorRotulo(page, /desligamento voluntário do bolsa família/i, RESPOSTAS_FIXAS.desligamentoBolsaFamilia, avisos);
  await selecionarPorRotulo(page, /alterar a data do pedido/i, RESPOSTAS_FIXAS.alterarDataPedido, avisos);

  // Checkboxes de ciência (óbito / acompanhar).
  for (const check of await page.getByRole('checkbox').all()) {
    await garantirMarcado(check).catch(() => undefined);
  }

  // --- Anexos: cada arquivo no slot nomeado certo ---
  await anexarDocumentos(page, opcoes.arquivos, avisos);

  await avancar(page);
}

/** Abre o modal de contatos, escolhe o tipo, preenche o valor e adiciona. */
async function adicionarContato(page: Page, tipo: string, valor: string): Promise<void> {
  await page.getByText(/Adicionar/i).first().click();
  await page.getByLabel(/Tipo de contato/i).selectOption({ label: tipo });
  await page.getByLabel(/^Valor/i).fill(valor);
  await page.getByRole('button', { name: /^Adicionar$/i }).click();
  await page.getByRole('button', { name: /Fechar/i }).click();
}

/** Escolhe uma opção num <select> localizado pelo rótulo. */
async function selecionarPorRotulo(
  page: Page,
  rotulo: RegExp,
  valor: string,
  avisos: string[],
): Promise<void> {
  try {
    const select = page.getByLabel(rotulo).first();
    // O GERID às vezes prefixa a opção ("B) Não", "C) Não"), então casamos a
    // opção cujo texto TERMINA com o valor — não dá para passar o valor cru.
    const textos = (await select.locator('option').allTextContents()).map((t) => t.trim());
    const alvo = textos.find((t) => t === valor || t.endsWith(valor));
    if (!alvo) {
      avisos.push(`Opção "${valor}" não encontrada em "${rotulo.source}" — confira.`);
      return;
    }
    await select.selectOption({ label: alvo });
  } catch {
    avisos.push(`Não consegui responder "${rotulo.source}" com "${valor}" — confira.`);
  }
}

/** Anexa cada documento no slot nomeado correspondente. */
async function anexarDocumentos(page: Page, arquivos: ArquivoLocal[], avisos: string[]): Promise<void> {
  for (const arq of arquivos) {
    const slot = slotGeridDoDocumento(arq.tipo);
    if (!slot) {
      avisos.push(`Documento "${arq.tipo}" sem slot definido no GERID — anexe manualmente.`);
      continue;
    }
    // Acha o input de arquivo dentro do bloco cujo título é o nome do slot.
    const bloco = page.locator('div', { hasText: slot }).last();
    const input = bloco.locator('input[type="file"]').last();
    try {
      await input.setInputFiles(arq.caminho);
      await page.waitForLoadState('networkidle').catch(() => undefined);
    } catch {
      avisos.push(`Falha ao anexar "${arq.tipo}" no slot "${slot}" — confira.`);
    }
  }
}

async function passo8SelecionarUnidade(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<void> {
  await esperarTela(page, /Selecionar Unidade|Consultar por CEP/i);

  const cep = apenasDigitos(caso.cliente.cep);
  await page.getByLabel(/^CEP/i).fill(cep);
  await page.getByRole('button', { name: /Buscar/i }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await escolherUnidadeDaCidade(page, caso.cliente.cidade, avisos);
  await avancar(page);
}

async function passo9OrgaoPagador(
  page: Page,
  caso: CasoParaProtocolar,
  avisos: string[],
): Promise<void> {
  await esperarTela(page, /Órgão Pagador|onde deseja receber o benefício/i);
  await escolherUnidadeDaCidade(page, caso.cliente.cidade, avisos);
  await avancar(page);
}

/**
 * Escolhe, numa lista de unidades (radios), a da MESMA cidade do cliente —
 * mesmo que a primeira seja de outra cidade (regra do escritório).
 */
async function escolherUnidadeDaCidade(page: Page, cidade: string, avisos: string[]): Promise<void> {
  const linhas = await page.locator('tr, [role="row"]').filter({ has: page.getByRole('radio') }).all();
  const opcoes = [];
  for (const linha of linhas) {
    opcoes.push({ nome: (await linha.innerText()).replace(/\s+/g, ' '), _loc: linha });
  }
  const escolhida = escolherUnidadePorCidade(opcoes, cidade);
  if (!escolhida) {
    avisos.push(`Nenhuma unidade da cidade "${cidade}" na lista — escolha manualmente antes de concluir.`);
    return;
  }
  await escolhida._loc.getByRole('radio').check();
}
