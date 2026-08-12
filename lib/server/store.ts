import { promises as fs } from 'node:fs';
import path from 'node:path';
import { carregarConfig, type AppConfig } from '@/config/default';
import { lerDados } from '@/src/modulo1/lerDados';
import { criarDemo } from '@/examples/demoData';
import type { ResultadoLeitura } from '@/src/domain/types';
import type { DriveGateway } from '@/src/integrations/drive/driveGateway';
import type {
  SheetsGateway,
  SheetsGatewayGravavel,
} from '@/src/integrations/sheets/sheetsGateway';
import { parseClientes, parseGrupoFamiliar } from '@/src/domain/parsePlanilha';
import { agruparGrupoFamiliar } from '@/src/domain/grupoFamiliar';
import { apenasDigitos } from '@/src/domain/texto';
import { salvarComprovante, type ComprovanteSalvo } from '@/src/modulo3/comprovante';
import {
  serializarClientes,
  serializarGrupoFamiliar,
  type ClienteComGrupo,
} from '@/src/domain/serializarPlanilha';
import {
  normalizarCadastro,
  validarCadastro,
  type EntradaCadastro,
} from '@/src/domain/validacaoCadastro';
import type {
  AcaoRevisao,
  CasoExecucao,
  ComprovanteCaso,
  EstadoGerid,
  Execucao,
  ExecucaoAtual,
  OverridesConfig,
  ProtocoloDoCliente,
  ProtocoloRegistrado,
  RegistroAcaoRevisao,
} from '@/lib/types';

export type { AcaoRevisao, ExecucaoAtual, OverridesConfig, RegistroAcaoRevisao };

/**
 * ESTADO DO SERVIDOR (somente servidor — nunca importe isto de um Client Component).
 *
 * Guarda config, execuções e ações de revisão, persistindo em `.data/estado.json`
 * para sobreviver a reload/restart. O resultado da leitura (Módulo 1) é
 * cacheado em memória e recarregado sob demanda.
 */

/** Caminho do estado persistido (sobrescrevível para testes). */
const ARQUIVO_ESTADO =
  process.env.RPA_ESTADO_ARQUIVO ?? path.join(process.cwd(), '.data', 'estado.json');

/**
 * Cópia dos comprovantes que o PAINEL serve para download.
 *
 * Fica ao lado do estado (e não dentro dele) de propósito: `estado.json` é
 * regravado a cada sinal da extensão, e enfiar PDFs em base64 ali deixaria
 * cada gravação centenas de KB mais pesada.
 */
const PASTA_COMPROVANTES = path.join(path.dirname(ARQUIVO_ESTADO), 'comprovantes');

interface Estado {
  overridesConfig: OverridesConfig;
  execucoes: Execucao[];
  execucaoAtual: ExecucaoAtual | null;
  acoesRevisao: Record<string, RegistroAcaoRevisao>;
  /** id do backup da planilha, criado antes da 1ª gravação (null = ainda não houve). */
  backupPlanilhaId?: string | null;
}

interface Cache {
  estado: Estado | null;
  resultado: ResultadoLeitura | null;
  lidoEm: string | null;
  /** Mensagem quando a leitura do Google falhou e caímos no dataset de exemplo. */
  erroFonte: string | null;
}

/**
 * Por quanto tempo a leitura do Drive vale antes de ser refeita sozinha.
 *
 * Antes o cache era eterno: a pasta de um cliente novo entrava no Drive e o
 * painel só enxergava depois que alguém clicasse em "Recarregar". Quem opera
 * não tem como adivinhar que precisa clicar — o efeito prático era cliente
 * parado sem ninguém perceber. Com a validade, pasta nova entra na fila
 * sozinha. É leitura, não protocolo: reler à toa não causa dano nenhum.
 */
const VALIDADE_LEITURA_MS = (() => {
  const bruto = Number(process.env.RPA_VALIDADE_LEITURA_MS ?? 3 * 60 * 1000);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 3 * 60 * 1000;
})();

// Singleton em globalThis para sobreviver ao hot-reload do Next em dev.
const globalStore = globalThis as unknown as {
  __rpaGeridCache?: Cache;
  __rpaGeridFilaGravacao?: Promise<void>;
  __rpaGeridSequenciaGravacao?: number;
};
const cache: Cache = (globalStore.__rpaGeridCache ??= {
  estado: null,
  resultado: null,
  lidoEm: null,
  erroFonte: null,
});

function estadoInicial(): Estado {
  return {
    overridesConfig: {},
    // Começa VAZIO: histórico só recebe execução real.
    execucoes: [],
    execucaoAtual: null,
    acoesRevisao: {},
    backupPlanilhaId: null,
  };
}

async function carregarEstado(): Promise<Estado> {
  if (cache.estado) return cache.estado;
  try {
    const bruto = await fs.readFile(ARQUIVO_ESTADO, 'utf8');
    cache.estado = { ...estadoInicial(), ...(JSON.parse(bruto) as Partial<Estado>) };
  } catch {
    cache.estado = estadoInicial();
  }
  return cache.estado;
}

// O job de execução grava com frequência enquanto outras requisições leem.
// Sem isto, duas gravações simultâneas deixam o arquivo pela metade e quem
// estiver lendo recebe JSON inválido.
export async function persistir(): Promise<void> {
  const fila = globalStore.__rpaGeridFilaGravacao ?? Promise.resolve();
  globalStore.__rpaGeridFilaGravacao = fila.then(gravar, gravar);
  return globalStore.__rpaGeridFilaGravacao;
}

async function gravar(): Promise<void> {
  if (!cache.estado) return;
  const sequencia = (globalStore.__rpaGeridSequenciaGravacao ?? 0) + 1;
  globalStore.__rpaGeridSequenciaGravacao = sequencia;
  const temporario = `${ARQUIVO_ESTADO}.${process.pid}.${sequencia}.tmp`;
  try {
    await fs.mkdir(path.dirname(ARQUIVO_ESTADO), { recursive: true });
    // Grava em arquivo temporário e troca — o rename é atômico, então um
    // leitor nunca enxerga conteúdo parcial.
    await fs.writeFile(temporario, JSON.stringify(cache.estado, null, 2), 'utf8');
    for (let tentativa = 0; ; tentativa++) {
      try {
        await fs.rename(temporario, ARQUIVO_ESTADO);
        break;
      } catch (erro) {
        const codigo = (erro as NodeJS.ErrnoException).code;
        if (!['EPERM', 'EACCES'].includes(codigo ?? '') || tentativa >= 4) throw erro;
        await new Promise((resolve) => setTimeout(resolve, 25 * (tentativa + 1)));
      }
    }
  } catch (erro) {
    // Falha ao gravar não pode derrubar o processo: o estado em memória segue
    // válido e a próxima gravação tenta de novo.
    console.warn('[rpa-gerid] não foi possível persistir o estado:', erro);
  } finally {
    await fs.rm(temporario, { force: true }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function getConfig(): Promise<AppConfig> {
  const estado = await carregarEstado();
  const base = carregarConfig();
  const o = estado.overridesConfig;
  return {
    ...base,
    ...(o.limiteTamanhoArquivoBytes !== undefined
      ? { limiteTamanhoArquivoBytes: o.limiteTamanhoArquivoBytes }
      : {}),
    ...(o.telefonePadrao !== undefined ? { telefonePadrao: o.telefonePadrao } : {}),
    ...(o.procurador !== undefined ? { procurador: o.procurador } : {}),
    ...(o.pastaRaizId !== undefined ? { pastaRaizId: o.pastaRaizId } : {}),
    ...(o.spreadsheetId !== undefined ? { spreadsheetId: o.spreadsheetId } : {}),
    ...(o.abaClientes !== undefined ? { abaClientes: o.abaClientes } : {}),
    ...(o.abaGrupoFamiliar !== undefined ? { abaGrupoFamiliar: o.abaGrupoFamiliar } : {}),
  };
}

export async function salvarConfig(overrides: OverridesConfig): Promise<void> {
  const estado = await carregarEstado();
  estado.overridesConfig = { ...estado.overridesConfig, ...overrides };
  await persistir();
  // Config mudou (limite/IDs) -> a leitura precisa ser refeita.
  cache.resultado = null;
}

// ---------------------------------------------------------------------------
// Origem dos dados: Google real se houver credencial, senão o dataset demo
// ---------------------------------------------------------------------------

export function usandoDadosReais(): boolean {
  // A credencial pode vir por arquivo (local) ou por variável (servidor).
  const temCredencial = Boolean(
    process.env.RPA_GOOGLE_CREDENTIALS?.trim() || process.env.RPA_GOOGLE_KEY_FILE?.trim(),
  );
  return Boolean(
    temCredencial && process.env.RPA_PASTA_RAIZ_ID && process.env.RPA_SPREADSHEET_ID,
  );
}

async function criarGateways(
  config: AppConfig,
): Promise<{ drive: DriveGateway; sheets: SheetsGateway }> {
  // No modo demo as abas são criadas com os nomes que a config usa, então o
  // app funciona mesmo já apontando para a planilha real ("Planilha1").
  if (!usandoDadosReais()) return criarDemo(config.abaClientes, config.abaGrupoFamiliar);

  // Importa os adapters do Google só quando há credencial (evita carregar
  // googleapis/exceljs à toa e mantém o caminho demo leve).
  const [{ criarAuth }, { DriveClient }, { XlsxSheetsGateway }] = await Promise.all([
    import('@/src/integrations/google/auth'),
    import('@/src/integrations/drive/driveClient'),
    import('@/src/integrations/sheets/xlsxSheets'),
  ]);
  const auth = criarAuth();
  const drive = new DriveClient(auth);
  // A planilha do escritório é .xlsx (não é Sheets nativo), então lemos
  // baixando o arquivo pela Drive API em vez de usar a Sheets API.
  return { drive, sheets: new XlsxSheetsGateway(drive) };
}

// ---------------------------------------------------------------------------
// Resultado da leitura (Módulo 1)
// ---------------------------------------------------------------------------

/** A leitura em cache passou da validade? Sem `lidoEm` nunca houve leitura. */
function leituraVencida(): boolean {
  if (!cache.lidoEm) return true;
  const quando = Date.parse(cache.lidoEm);
  if (!Number.isFinite(quando)) return true;
  return Date.now() - quando >= VALIDADE_LEITURA_MS;
}

export async function getResultado(forcar = false): Promise<ResultadoLeitura> {
  if (cache.resultado && !forcar && !leituraVencida()) return cache.resultado;
  const config = await getConfig();

  try {
    const { drive, sheets } = await criarGateways(config);
    cache.resultado = await lerDados(config, drive, sheets);
    cache.erroFonte = null;
  } catch (erro) {
    // No modo demo qualquer erro é bug nosso — deixa estourar.
    if (!usandoDadosReais()) throw erro;

    // Falha no Google (credencial, permissão, relógio fora de sincronia...)
    // NÃO pode derrubar o painel: cai no dataset de exemplo e avisa na tela.
    cache.erroFonte = explicarErroDeLeitura(erro);
    console.warn('[rpa-gerid] falha ao ler o Google, usando dados de exemplo:', cache.erroFonte);
    const { drive, sheets } = criarDemo(config.abaClientes, config.abaGrupoFamiliar);
    cache.resultado = await lerDados(config, drive, sheets);
  }

  cache.lidoEm = new Date().toISOString();
  return cache.resultado;
}

/** Traduz erros comuns do Google para algo acionável na tela. */
function explicarErroDeLeitura(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);

  if (texto.includes('invalid_grant') || texto.includes('Invalid JWT')) {
    return (
      'Credencial recusada pelo Google porque o RELÓGIO do computador está fora de sincronia. ' +
      'Sincronize a hora do Windows (Configurações → Hora e idioma → "Sincronizar agora") e recarregue os dados.'
    );
  }
  if (texto.includes('404') || texto.toLowerCase().includes('not found')) {
    return `Pasta ou planilha não encontrada. Confirme que foram compartilhadas com a service account. (${texto})`;
  }
  if (texto.includes('403') || texto.toLowerCase().includes('permission')) {
    return `Sem permissão. Compartilhe a pasta "Protocolo INSS" com o e-mail da service account. (${texto})`;
  }
  return texto;
}

export async function recarregarResultado(): Promise<ResultadoLeitura> {
  return getResultado(true);
}

export function getLidoEm(): string | null {
  return cache.lidoEm;
}

/** Mensagem de falha ao ler o Google (null quando está tudo certo). */
export function getErroFonte(): string | null {
  return cache.erroFonte;
}

// ---------------------------------------------------------------------------
// Cadastro pelo sistema — grava na planilha
// ---------------------------------------------------------------------------

/**
 * Salva (cria ou atualiza) um cliente e seu grupo familiar NA PLANILHA.
 *
 * Lê o estado atual, aplica a mudança e regrava as duas abas. Antes da PRIMEIRA
 * gravação faz um backup da planilha no Drive — é o arquivo do cliente.
 */
export async function salvarClienteNaPlanilha(entrada: EntradaCadastro): Promise<void> {
  const erros = validarCadastro(entrada);
  if (erros.length > 0) throw new Error(erros.join(' '));

  const normalizado = normalizarCadastro(entrada);
  const config = await getConfig();
  const { drive, sheets } = await criarGateways(config);

  if (!('escreverAbas' in sheets)) {
    throw new Error(
      'A planilha atual é somente leitura. Configure a credencial Google (.env) para cadastrar pelo sistema.',
    );
  }
  const gravavel = sheets as SheetsGatewayGravavel;

  await garantirBackup(drive, config.spreadsheetId);

  // Estado atual da planilha -> substitui/insere este cliente.
  const registros = await carregarRegistros(config, sheets);
  const alvo = apenasDigitos(normalizado.cliente.cpf);
  const semAlvo = registros.filter((r) => apenasDigitos(r.cliente.cpf) !== alvo);
  const atualizados: ClienteComGrupo[] = [
    ...semAlvo,
    {
      cliente: normalizado.cliente,
      grupoFamiliar: {
        requerenteCpf: alvo,
        integrantes: normalizado.integrantes,
      },
    },
  ];
  atualizados.sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'));

  await gravarRegistros(gravavel, config, atualizados);
  cache.resultado = null; // força reler
}

/** Remove um cliente (e seus integrantes) da planilha. */
export async function excluirClienteDaPlanilha(cpf: string): Promise<void> {
  const config = await getConfig();
  const { drive, sheets } = await criarGateways(config);
  if (!('escreverAbas' in sheets)) throw new Error('Planilha somente leitura.');
  const gravavel = sheets as SheetsGatewayGravavel;

  await garantirBackup(drive, config.spreadsheetId);

  const alvo = apenasDigitos(cpf);
  const registros = await carregarRegistros(config, sheets);
  const restantes = registros.filter((r) => apenasDigitos(r.cliente.cpf) !== alvo);
  if (restantes.length === registros.length) {
    throw new Error(`Cliente com CPF ${cpf} não encontrado na planilha.`);
  }

  await gravarRegistros(gravavel, config, restantes);
  cache.resultado = null;
}

/** Lê a planilha e devolve os clientes com seus grupos familiares. */
async function carregarRegistros(
  config: AppConfig,
  sheets: SheetsGateway,
): Promise<ClienteComGrupo[]> {
  const [linhasClientes, linhasGrupo] = await Promise.all([
    sheets.lerAba(config.spreadsheetId, config.abaClientes),
    sheets.lerAba(config.spreadsheetId, config.abaGrupoFamiliar).catch(() => [] as string[][]),
  ]);

  const clientes = parseClientes(linhasClientes, config.mapeamentoClientes);
  const grupos = agruparGrupoFamiliar(
    parseGrupoFamiliar(linhasGrupo, config.mapeamentoGrupoFamiliar),
  );

  return clientes.map((cliente) => ({
    cliente,
    grupoFamiliar: grupos.get(apenasDigitos(cliente.cpf)) ?? {
      requerenteCpf: apenasDigitos(cliente.cpf),
      integrantes: [],
    },
  }));
}

async function gravarRegistros(
  sheets: SheetsGatewayGravavel,
  config: AppConfig,
  registros: ClienteComGrupo[],
): Promise<void> {
  await sheets.escreverAbas(config.spreadsheetId, {
    [config.abaClientes]: serializarClientes(registros, config.mapeamentoClientes),
    [config.abaGrupoFamiliar]: serializarGrupoFamiliar(
      registros,
      config.mapeamentoGrupoFamiliar,
    ),
  });
}

/**
 * Guarda uma cópia da planilha EM DISCO antes da primeira gravação.
 *
 * O backup é local (e não uma cópia no Drive) porque service account não tem
 * cota de armazenamento e não consegue criar arquivos no Drive pessoal.
 * Restaurar: `pnpm restaurar` (scripts/restaurarPlanilha.ts).
 */
async function garantirBackup(drive: DriveGateway, spreadsheetId: string): Promise<void> {
  const estado = await carregarEstado();
  if (estado.backupPlanilhaId) return;
  try {
    const bytes = await drive.baixarArquivo(spreadsheetId);
    const pasta = path.join(process.cwd(), 'backups');
    await fs.mkdir(pasta, { recursive: true });
    const destino = path.join(pasta, `planilha-original-${spreadsheetId}.xlsx`);
    await fs.writeFile(destino, bytes);
    estado.backupPlanilhaId = destino;
    await persistir();
    console.info('[rpa-gerid] backup da planilha salvo em:', destino);
  } catch (erro) {
    // Backup é proteção, não pode impedir o cadastro — mas registra o aviso.
    console.warn('[rpa-gerid] não foi possível criar o backup da planilha:', erro);
  }
}

/** Lê um cliente da planilha para preencher o formulário de edição. */
export async function getClienteParaEdicao(cpf: string): Promise<ClienteComGrupo | null> {
  const config = await getConfig();
  const { sheets } = await criarGateways(config);
  const alvo = apenasDigitos(cpf);
  const registros = await carregarRegistros(config, sheets);
  return registros.find((r) => apenasDigitos(r.cliente.cpf) === alvo) ?? null;
}

// ---------------------------------------------------------------------------
// Ações da fila de revisão
// ---------------------------------------------------------------------------

export async function getAcoesRevisao(): Promise<Record<string, RegistroAcaoRevisao>> {
  return (await carregarEstado()).acoesRevisao;
}

export async function registrarAcaoRevisao(chave: string, acao: AcaoRevisao): Promise<void> {
  const estado = await carregarEstado();
  estado.acoesRevisao[chave] = { acao, em: new Date().toISOString() };
  await persistir();
}

export async function limparAcaoRevisao(chave: string): Promise<void> {
  const estado = await carregarEstado();
  delete estado.acoesRevisao[chave];
  await persistir();
}

export async function limparExecucaoAtual(): Promise<void> {
  const estado = await carregarEstado();
  estado.execucaoAtual = null;
  await persistir();
}

/**
 * Atualiza o status de um caso específico durante a execução atual.
 * Utilizado pela API da Extensão do Chrome.
 */
export async function atualizarStatusCaso(
  idExecucao: string,
  cpf: string,
  status: 'sucesso' | 'erro' | 'revisao',
  motivoErro?: string,
  protocolo?: string,
): Promise<void> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual || atual.id !== idExecucao) return;

  const caso = atual.casos.find((c) => c.cpf === cpf);
  if (!caso) return;

  atual.ultimoSinalEm = new Date().toISOString();
  caso.status = status;
  if (status === 'erro' || status === 'revisao') {
    // ⚠️ Um caso em modo só-comprovante JA ENTROU na fila com protocolo
    // confirmado. Apagar o numero aqui faria a desduplicacao perder a chave, e
    // na proxima rodada o robo protocolaria a mesma pessoa DE NOVO — o dano
    // exato que a trava existe para impedir. Falhar em baixar o PDF nao apaga
    // um requerimento que o INSS ja recebeu.
    if (!caso.somenteComprovante) caso.protocolo = undefined;
    caso.motivoErro = motivoErro;
    if (status === 'revisao') atual.estadoGerid = 'revisao';
  } else if (status === 'sucesso') {
    caso.motivoErro = undefined;
    caso.protocolo = protocolo;
  }
  await persistir();
}

/**
 * Devolve um caso parado (`revisao` ou `erro`) para a fila.
 *
 * Existe porque `/api/ext/fila` só entrega casos `pendente`/`processando`: um
 * caso que parou em "Revisar e confirmar" ficava fora da fila para sempre, e
 * clicar em Iniciar não o refazia. Quem decide é o operador, depois de olhar o
 * GERID — por isso é uma ação explícita e não algo automático.
 *
 * ⚠️ Caso COM protocolo nunca volta. Ter protocolo significa que o INSS já
 * recebeu o pedido; refazer criaria um segundo requerimento em nome da mesma
 * pessoa. Se o número estiver errado, corrija o número — não reprotocole.
 */
export async function reenfileirarCaso(cpf: string): Promise<void> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual) throw new Error('Nao ha execucao aberta.');

  const caso = atual.casos.find((c) => c.cpf === cpf);
  if (!caso) throw new Error('Caso nao encontrado nesta execucao.');
  if (caso.protocolo) {
    throw new Error(
      `${caso.nome} ja tem o protocolo ${caso.protocolo}. Refazer criaria um segundo requerimento no INSS.`,
    );
  }
  if (caso.status !== 'revisao' && caso.status !== 'erro') {
    throw new Error(`${caso.nome} esta em "${caso.status}" — so caso parado volta para a fila.`);
  }

  caso.status = 'pendente';
  caso.motivoErro = undefined;
  // A execução precisa voltar a "rodando", senão `/api/ext/fila` responde que
  // não há fila e a extensão não pega o caso que acabou de ser devolvido.
  atual.status = 'rodando';
  atual.estadoGerid = 'aguardando_extensao';
  atual.ultimoSinalEm = new Date().toISOString();
  await persistir();
}

/** Impede que um lote real seja criado com o fallback de demonstracao. */
export function garantirFonteConfiavelParaExecucao(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (!usandoDadosReais()) {
    throw new Error(
      'Execucao bloqueada: as credenciais e os IDs do Google Drive nao estao completos.',
    );
  }
  if (cache.erroFonte) {
    throw new Error(`Execucao bloqueada: a leitura do Google Drive falhou. ${cache.erroFonte}`);
  }
}

/**
 * Liga/desliga a pausa da fila pelo painel.
 *
 * A pausa NÃO cancela nada: os casos continuam `pendente` e a execução segue
 * aberta. Ela só faz a extensão parar de pegar caso novo — o que já está na
 * tela do GERID termina. Retomar zera o relógio de inatividade, senão a
 * execução expiraria no instante seguinte por "extensão sumiu".
 */
export async function definirPausaExecucao(pausar: boolean): Promise<ExecucaoAtual | null> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual) throw new Error('Nao ha execucao aberta para pausar.');
  if (atual.status !== 'rodando') {
    throw new Error(`A execucao esta em "${atual.status}" — so fila rodando pode ser pausada.`);
  }

  if (pausar) {
    atual.pausadaEm = new Date().toISOString();
  } else {
    delete atual.pausadaEm;
    atual.ultimoSinalEm = new Date().toISOString();
  }
  await persistir();
  return structuredClone(atual);
}

/** A fila está pausada? Consultado pelas rotas que a extensão chama. */
export async function execucaoPausada(idExecucao: string): Promise<boolean> {
  const atual = (await carregarEstado()).execucaoAtual;
  return Boolean(atual && atual.id === idExecucao && atual.pausadaEm);
}

/** Registra que a extensao continua ativa e informa a etapa atual do GERID. */
export async function registrarSinalExtensao(
  idExecucao: string,
  estadoGerid: EstadoGerid,
  detalheGerid?: string,
): Promise<ExecucaoAtual | null> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual || atual.id !== idExecucao || atual.status !== 'rodando') return null;

  atual.ultimoSinalEm = new Date().toISOString();
  atual.estadoGerid = estadoGerid;
  atual.detalheGerid = detalheGerid;
  await persistir();
  return structuredClone(atual);
}

/**
 * Baixa um documento que pertence a um caso ainda ativo. Esta é a única forma
 * de a extensão receber anexos: ela nunca recebe acesso amplo ao Google Drive.
 */
export async function baixarArquivoParaExtensao(
  idExecucao: string,
  arquivoId: string,
): Promise<{ bytes: Uint8Array; nome: string; mimeType: string }> {
  const atual = (await carregarEstado()).execucaoAtual;
  if (!atual || atual.id !== idExecucao || atual.status !== 'rodando') {
    throw new Error('A execução informada não está ativa.');
  }

  const resultado = await getResultado();
  const cpfsAtivos = new Set(atual.casos.map((c) => apenasDigitos(c.cpf)));
  const dono = resultado.clientesProntos.find(
    (c) =>
      cpfsAtivos.has(apenasDigitos(c.cliente.cpf)) &&
      c.arquivos.some((a) => a.id === arquivoId),
  );
  const arquivo = dono?.arquivos.find((a) => a.id === arquivoId);
  if (!arquivo) throw new Error('Documento não pertence à execução atual.');

  const { drive } = await criarGateways(await getConfig());
  return { bytes: await drive.baixarArquivo(arquivoId), nome: arquivo.nome, mimeType: arquivo.mimeType };
}

// ---------------------------------------------------------------------------
// Execuções
// ---------------------------------------------------------------------------

/**
 * Arquiva o comprovante do protocolo na pasta do cliente no Drive.
 *
 * Antes disso o PDF que a extensao capturava era escrito em `saida/<cpf>/` e
 * ficava so na maquina de quem rodou — o escritorio abre a pasta do cliente no
 * Drive, nao a pasta do robo. Aqui o destino passa a ser o Modulo 3, que TENTA
 * o Drive e, se a credencial nao puder criar arquivo (a service account nao tem
 * cota), cai para o disco local e devolve o motivo por escrito. Nunca finge
 * que arquivou.
 */
export async function arquivarComprovante(
  cpf: string,
  bytes: Uint8Array,
): Promise<ComprovanteSalvo> {
  const config = await getConfig();
  const alvo = apenasDigitos(cpf);
  const pastaLocal = path.join(process.cwd(), 'saida', alvo);

  // A pasta do cliente vem do Modulo 1 (a leitura do Drive). Sem ela nao ha
  // para onde subir, e insistir no Drive so produziria um erro confuso.
  const resultado = await getResultado().catch(() => null);
  const dono = resultado?.clientesProntos.find(
    (c) => apenasDigitos(c.cliente.cpf) === alvo,
  );
  if (!dono?.pastaId) {
    const referencia = await salvarComprovanteLocal(bytes, config.posProtocolo.nomeComprovante, pastaLocal);
    return {
      destino: 'local',
      referencia,
      aviso:
        'Nao encontrei a pasta deste CPF no Drive (o cliente pode ja ter sido movido para ' +
        `"${config.posProtocolo.nomePastaProtocolado}"). O comprovante ficou em ${referencia}.`,
    };
  }

  const { drive } = await criarGateways(config);
  return salvarComprovante(drive, bytes, 'application/pdf', {
    pastaClienteId: dono.pastaId,
    nomeBase: config.posProtocolo.nomeComprovante,
    pastaLocal,
  });
}

/**
 * Nome do arquivo da cópia do painel.
 *
 * `idExecucao` e `cpf` vêm de fora (querystring), então tudo que não for
 * letra/dígito/hífen cai — sem isso um `../` no parâmetro leria qualquer
 * arquivo do servidor.
 */
function arquivoDoComprovante(idExecucao: string, cpf: string): string {
  const id = idExecucao.replace(/[^a-zA-Z0-9-]/g, '');
  const alvo = apenasDigitos(cpf);
  if (!id || !alvo) throw new Error('Execucao ou CPF invalido para o comprovante.');
  return path.join(PASTA_COMPROVANTES, `${id}__${alvo}.pdf`);
}

/**
 * Guarda a cópia do comprovante que o PAINEL entrega para download e anota o
 * registro no caso.
 *
 * Existe porque o operador não deveria precisar abrir o Drive para conferir se
 * o protocolo saiu — e porque, enquanto a service account não tiver cota, o
 * Drive nem recebe o arquivo. Falhar aqui é aviso, nunca erro: o requerimento
 * já entrou no INSS.
 */
export async function anexarComprovanteAoCaso(
  idExecucao: string,
  cpf: string,
  bytes: Uint8Array,
  nome: string,
  origem: { destino: 'drive' | 'local'; referencia: string },
): Promise<ComprovanteCaso | null> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual || atual.id !== idExecucao) return null;
  const caso = atual.casos.find((c) => c.cpf === cpf);
  if (!caso) return null;

  const destinoArquivo = arquivoDoComprovante(idExecucao, cpf);
  await fs.mkdir(PASTA_COMPROVANTES, { recursive: true });
  await fs.writeFile(destinoArquivo, bytes);

  caso.comprovante = {
    nome: nome.endsWith('.pdf') ? nome : `${nome}.pdf`,
    tamanhoBytes: bytes.byteLength,
    destino: origem.destino,
    referencia: origem.referencia,
    em: new Date().toISOString(),
  };
  await persistir();
  return caso.comprovante;
}

/**
 * Lê a cópia do painel. Só devolve o arquivo de um caso que REALMENTE tem
 * comprovante registrado — a execução atual ou o histórico —, para que a rota
 * não vire um leitor de arquivo arbitrário a partir da querystring.
 */
export async function lerComprovanteDoCaso(
  idExecucao: string,
  cpf: string,
): Promise<{ bytes: Buffer; nome: string } | null> {
  const estado = await carregarEstado();
  const execucao =
    estado.execucaoAtual?.id === idExecucao
      ? estado.execucaoAtual
      : estado.execucoes.find((e) => e.id === idExecucao);
  // Compara por dígitos: o nome do arquivo já é só dígito, e o CPF chega ora da
  // planilha (cru, com zero à esquerda), ora com máscara vinda da tela. Casar
  // texto puro aqui devolveria 404 num comprovante que está guardado.
  const alvo = apenasDigitos(cpf);
  const caso = execucao?.casos.find((c) => apenasDigitos(c.cpf) === alvo);
  if (!caso?.comprovante) return null;

  try {
    const bytes = await fs.readFile(arquivoDoComprovante(idExecucao, cpf));
    return { bytes, nome: caso.comprovante.nome };
  } catch {
    // O registro existe mas o arquivo sumiu (disco efêmero de deploy, por
    // exemplo). Devolver null faz a rota responder 404 com franqueza em vez
    // de entregar um PDF vazio.
    return null;
  }
}

async function salvarComprovanteLocal(
  bytes: Uint8Array,
  nomeBase: string,
  pastaLocal: string,
): Promise<string> {
  await fs.mkdir(pastaLocal, { recursive: true });
  const destino = path.join(pastaLocal, `${nomeBase}.pdf`);
  await fs.writeFile(destino, bytes);
  return destino;
}

export async function getExecucoes(): Promise<Execucao[]> {
  const estado = await carregarEstado();
  return [...estado.execucoes].sort((a, b) => b.dataISO.localeCompare(a.dataISO));
}

export async function getExecucao(id: string): Promise<Execucao | null> {
  const estado = await carregarEstado();
  return estado.execucoes.find((e) => e.id === id) ?? null;
}

export async function getExecucaoAtual(): Promise<ExecucaoAtual | null> {
  const atual = (await carregarEstado()).execucaoAtual;
  // Snapshot: o job muta o objeto interno enquanto roda; quem consulta não
  // pode receber uma referência que muda debaixo dele.
  return atual ? structuredClone(atual) : null;
}

/**
 * Todo CPF que já tem protocolo do GERID, em qualquer execução do histórico
 * (mais a que está aberta agora). Chaveado por CPF só em dígitos, porque a
 * planilha do escritório guarda CPF com zero à esquerda e o GERID devolve com
 * máscara — comparar texto cru deixaria passar o mesmo cliente duas vezes.
 *
 * Quando o mesmo CPF aparece mais de uma vez, fica o registro MAIS ANTIGO: é
 * o protocolo que vale, os seguintes seriam duplicidade a corrigir.
 */
export async function protocolosPorCpf(): Promise<Map<string, ProtocoloRegistrado>> {
  const estado = await carregarEstado();
  const mapa = new Map<string, ProtocoloRegistrado>();

  const lotes: Array<{ id: string; dataISO: string; casos: CasoExecucao[] }> = [
    ...estado.execucoes.map((e) => ({ id: e.id, dataISO: e.dataISO, casos: e.casos })),
  ];
  if (estado.execucaoAtual) {
    lotes.push({
      id: estado.execucaoAtual.id,
      dataISO: estado.execucaoAtual.iniciadoEm,
      casos: estado.execucaoAtual.casos,
    });
  }

  // 1ª passada: qual é o protocolo que VALE para cada CPF (o mais antigo).
  for (const lote of lotes) {
    for (const caso of lote.casos) {
      const numero = String(caso.protocolo ?? '').trim();
      if (!numero) continue;
      const chave = apenasDigitos(caso.cpf);
      if (!chave) continue;
      const anterior = mapa.get(chave);
      if (anterior && Date.parse(anterior.em) <= Date.parse(lote.dataISO)) continue;
      mapa.set(chave, { cpf: caso.cpf, nome: caso.nome, protocolo: numero, em: lote.dataISO });
    }
  }

  // 2ª passada: o comprovante desse protocolo, venha da execução que vier.
  // Ele quase nunca sai junto — costuma chegar numa rodada POSTERIOR, no modo
  // só-comprovante. Ler o PDF apenas do registro mais antigo faria o cliente
  // voltar à fila para sempre, atrás de um arquivo que já está guardado.
  // O número tem que bater: PDF de outro requerimento da mesma pessoa (um BPC
  // negado no ano passado, por exemplo) não é o comprovante deste protocolo.
  for (const lote of lotes) {
    for (const caso of lote.casos) {
      if (!caso.comprovante) continue;
      const registro = mapa.get(apenasDigitos(caso.cpf));
      if (!registro || registro.comprovante) continue;
      if (String(caso.protocolo ?? '').trim() !== registro.protocolo) continue;
      registro.comprovante = caso.comprovante;
      registro.idExecucaoDoComprovante = lote.id;
    }
  }
  return mapa;
}

/**
 * O protocolo de UM cliente, do jeito que a tela dele precisa: com o id da
 * execução para montar o link e com a conferência de que o PDF continua no
 * disco.
 *
 * A tela do cliente é onde o operador vai olhar quando alguém liga perguntando
 * "saiu?" — procurar em qual execução a pessoa caiu, três meses depois, é
 * trabalho que o painel tem que poupar.
 */
export async function protocoloDoCpf(cpf: string): Promise<ProtocoloDoCliente | null> {
  const registro = (await protocolosPorCpf()).get(apenasDigitos(cpf));
  if (!registro) return null;

  const id = registro.idExecucaoDoComprovante;
  const arquivoDisponivel =
    !!registro.comprovante &&
    !!id &&
    (await fs.access(arquivoDoComprovante(id, registro.cpf)).then(
      () => true,
      () => false,
    ));

  return { ...registro, arquivoDisponivel };
}

/**
 * Inicia uma execucao real, consumida pela extensao no navegador autenticado
 * do operador. Nenhum caso e marcado como sucesso sem protocolo do GERID.
 */
export async function iniciarExecucao(): Promise<ExecucaoAtual> {
  const estado = await carregarEstado();

  if (estado.execucaoAtual?.status === 'rodando') return structuredClone(estado.execucaoAtual);

  // Força reler o Drive: quem clica em "Iniciar" espera a fila de AGORA, com
  // as pastas que entraram desde a última leitura. Ler cache aqui seria
  // deixar cliente novo de fora sem avisar ninguém.
  const resultado = await getResultado(true);
  garantirFonteConfiavelParaExecucao();

  const jaProtocolados = await protocolosPorCpf();
  const pulados: ProtocoloRegistrado[] = [];
  const casos: CasoExecucao[] = [];

  for (const c of resultado.clientesProntos) {
    // ⚠️ Trava de duplicidade. Um protocolo é um requerimento ABERTO no INSS
    // em nome de uma pessoa com deficiência; refazer cria um segundo pedido
    // que alguém depois tem que cancelar na mão. Enquanto a pasta não é
    // movida para "Protocolado/", o Drive continua devolvendo o cliente todo
    // dia — é aqui que ele para.
    const registro = jaProtocolados.get(apenasDigitos(c.cliente.cpf));
    if (registro) {
      // Protocolado E com comprovante arquivado: acabou, sai da fila.
      if (registro.comprovante) {
        pulados.push(registro);
        continue;
      }
      // Protocolado mas SEM o PDF. O requerimento existe, então refazer está
      // fora de questão; o que falta é o comprovante na pasta do cliente. Volta
      // à fila em modo só-comprovante: a extensão busca o número na lista de
      // tarefas e nem encosta no formulário do requerimento.
      casos.push({
        cpf: registro.cpf,
        nome: registro.nome,
        status: 'pendente',
        protocolo: registro.protocolo,
        somenteComprovante: true,
      });
      continue;
    }
    casos.push({ cpf: c.cliente.cpf, nome: c.cliente.nome, status: 'pendente' });
  }

  // Sem caso pronto não há o que protocolar — abrir o navegador à toa só
  // geraria um relatório vazio e confundiria o operador.
  if (casos.length === 0) {
    // Distingue "não há cliente" de "todos já foram". A segunda é o estado
    // normal de um dia sem pasta nova, e dizer "resolva as pendências" nela
    // mandaria o operador procurar um problema que não existe.
    if (pulados.length > 0) {
      // Nome e número, não só a contagem. Quando alguém reclama que um cliente
      // "não foi protocolado" mas a fila insiste em vir vazia, a única pergunta
      // que importa é QUAL protocolo o sistema acha que é dele — com o número na
      // mão dá para conferir no GERID em dez segundos se a atribuição está certa.
      const quem = pulados.map((p) => `${p.nome} (protocolo ${p.protocolo})`).join('; ');
      throw new Error(
        `Nada a protocolar: os ${pulados.length} cliente(s) prontos já têm protocolo — ${quem}. ` +
          'Pastas novas no Drive entram na fila sozinhas.',
      );
    }
    throw new Error(
      'Nenhum cliente está pronto para protocolar. Resolva as pendências em "Revisão manual" e recarregue os dados.',
    );
  }

  const agora = new Date();
  const atual: ExecucaoAtual = {
    id: `exec-${agora.getTime()}`,
    iniciadoEm: agora.toISOString(),
    ultimoSinalEm: agora.toISOString(),
    estadoGerid: 'aguardando_extensao',
    status: 'rodando',
    casos,
    ...(pulados.length > 0 ? { pulados } : {}),
  };
  estado.execucaoAtual = atual;
  await persistir();

  const instantaneo = structuredClone(atual);
  void processarExecucao(atual.id);
  return instantaneo;
}

/**
 * Mantem a execucao disponivel enquanto a extensao envia sinais de atividade.
 * Se a extensao ou o navegador parar, a execucao expira de forma controlada.
 */
async function processarExecucao(id: string): Promise<void> {
  // A execução é feita pela extensão no navegador do operador. Ainda assim,
  // a execução no servidor precisa expirar: se o navegador/extensão cair, nenhum
  // caso pode ficar "pendente" ou "processando" indefinidamente.
  const bruto = Number(
    process.env.RPA_TEMPO_LIMITE_EXECUCAO_MS ??
      process.env.RPA_PAUSA_EXECUCAO_MS ??
      30 * 60 * 1000,
  );
  const prazoMs = Number.isFinite(bruto) && bruto > 0 ? bruto : 30 * 60 * 1000;

  const intervaloMs = Math.max(10, Math.min(60_000, Math.floor(prazoMs / 2)));
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, intervaloMs));
    const atual = await getExecucaoAtual();
    if (!atual || atual.id !== id || atual.status !== 'rodando') return;

    // Fila pausada pelo operador não é fila abandonada. Sem esta guarda, uma
    // pausa mais longa que o prazo faria a execução expirar e os casos que
    // ainda não rodaram virariam "erro" sozinhos.
    if (atual.pausadaEm) continue;

    const referencia = Date.parse(atual.ultimoSinalEm ?? atual.iniciadoEm);
    if (!Number.isFinite(referencia) || Date.now() - referencia >= prazoMs) {
      await finalizarExecucao(id);
      return;
    }
  }
}

/**
 * Fecha a execução: resolve os casos que sobraram, grava o relatório e muda
 * o status. Vale tanto para a execução que rodou quanto para a que foi
 * recusada de saída.
 */
export async function finalizarExecucao(id: string): Promise<void> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual || atual.id !== id) return;

  // Quem ficou pendente (execução interrompida) vira erro — nunca some.
  for (const caso of atual.casos) {
    if (caso.status === 'pendente' || caso.status === 'processando') {
      caso.status = 'erro';
      caso.motivoErro ??= 'Execução interrompida antes de processar este caso.';
    }
  }

  const sucesso = atual.casos.filter((c) => c.status === 'sucesso').length;
  const erro = atual.casos.filter((c) => c.status === 'erro').length;
  const revisao = atual.casos.filter((c) => c.status === 'revisao').length;

  // Grava no histórico ANTES de marcar como concluída: quando a UI vir
  // "concluida", o relatório correspondente já existe.
  estado.execucoes.push({
    id: atual.id,
    dataISO: atual.iniciadoEm,
    total: atual.casos.length,
    prontos: atual.casos.length,
    sucesso,
    erro,
    casos: atual.casos,
  });
  atual.status = erro > 0 && sucesso === 0 && revisao === 0 ? 'erro' : 'concluida';
  await persistir();
}
