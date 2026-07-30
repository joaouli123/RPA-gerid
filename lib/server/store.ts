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
  Execucao,
  ExecucaoAtual,
  OverridesConfig,
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

// Singleton em globalThis para sobreviver ao hot-reload do Next em dev.
const globalCache = globalThis as unknown as { __rpaGeridCache?: Cache };
const cache: Cache = (globalCache.__rpaGeridCache ??= {
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
let filaGravacao: Promise<void> = Promise.resolve();

async function persistir(): Promise<void> {
  filaGravacao = filaGravacao.then(gravar, gravar);
  return filaGravacao;
}

async function gravar(): Promise<void> {
  if (!cache.estado) return;
  try {
    await fs.mkdir(path.dirname(ARQUIVO_ESTADO), { recursive: true });
    // Grava em arquivo temporário e troca — o rename é atômico, então um
    // leitor nunca enxerga conteúdo parcial.
    const temporario = `${ARQUIVO_ESTADO}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(cache.estado, null, 2), 'utf8');
    await fs.rename(temporario, ARQUIVO_ESTADO);
  } catch (erro) {
    // Falha ao gravar não pode derrubar o processo: o estado em memória segue
    // válido e a próxima gravação tenta de novo.
    console.warn('[rpa-gerid] não foi possível persistir o estado:', erro);
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

export async function getResultado(forcar = false): Promise<ResultadoLeitura> {
  if (cache.resultado && !forcar) return cache.resultado;
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
  status: 'sucesso' | 'erro',
  motivoErro?: string,
  protocolo?: string,
): Promise<void> {
  const estado = await carregarEstado();
  const atual = estado.execucaoAtual;
  if (!atual || atual.id !== idExecucao) return;

  const caso = atual.casos.find((c) => c.cpf === cpf);
  if (!caso) return;

  caso.status = status;
  if (status === 'erro') {
    caso.motivoErro = motivoErro;
  } else if (status === 'sucesso') {
    caso.protocolo = protocolo;
  }
  await persistir();
}

// ---------------------------------------------------------------------------
// Execuções
// ---------------------------------------------------------------------------

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

/** Pausa entre casos na execução simulada (menor nos testes). */
/**
 * Inicia uma execução REAL: abre o Gerid com Playwright e protocola os casos
 * prontos. Nada é simulado — se o robô não consegue protocolar, o caso é
 * marcado como ERRO com o motivo, nunca como sucesso.
 */
export async function iniciarExecucao(): Promise<ExecucaoAtual> {
  const estado = await carregarEstado();

  if (estado.execucaoAtual?.status === 'rodando') return structuredClone(estado.execucaoAtual);

  const resultado = await getResultado();
  const casos: CasoExecucao[] = resultado.clientesProntos.map((c) => ({
    cpf: c.cliente.cpf,
    nome: c.cliente.nome,
    status: 'pendente',
  }));

  // Sem caso pronto não há o que protocolar — abrir o navegador à toa só
  // geraria um relatório vazio e confundiria o operador.
  if (casos.length === 0) {
    throw new Error(
      'Nenhum cliente está pronto para protocolar. Resolva as pendências em "Revisão manual" e recarregue os dados.',
    );
  }

  const agora = new Date();
  const atual: ExecucaoAtual = {
    id: `exec-${agora.getTime()}`,
    iniciadoEm: agora.toISOString(),
    status: 'rodando',
    casos,
  };
  estado.execucaoAtual = atual;
  await persistir();

  const instantaneo = structuredClone(atual);
  void processarExecucao(atual.id);
  return instantaneo;
}

/**
 * Processa a execução com o robô REAL do Gerid.
 * Cada caso só vira "sucesso" se o Gerid devolver um número de protocolo.
 * Qualquer problema vira "erro" com o motivo — nunca sucesso falso.
 */
async function processarExecucao(id: string): Promise<void> {
  const config = await getConfig();
  const resultado = await getResultado();
  const prontos = resultado.clientesProntos;

  const [{ RoboGeridPlaywright }, { ErroGerid, FalhaGerid }, { mapaGerid, mapeamentoCompleto }] =
    await Promise.all([
      import('@/src/modulo2/roboGerid'),
      import('@/src/modulo2/tiposGerid'),
      import('@/src/modulo2/mapaGerid'),
    ]);

  // Recusa ANTES de abrir o navegador. O robô já se recusava a protocolar sem
  // o mapeamento, mas só depois de subir o Chrome — o que abria uma janela na
  // máquina de quem clicou, para no fim não fazer nada. Falhar aqui é mais
  // honesto e não encosta no Gerid.
  if (!mapeamentoCompleto()) {
    // Mensagem para o usuário: curta e sem jargão. O detalhe técnico (as
    // pendências do mapaGerid) vai só para o log do servidor.
    const motivo =
      'O preenchimento automático no Gerid ainda está em desenvolvimento — esta etapa entra ' +
      'em breve. Por enquanto o robô não protocola.';
    console.info('[rpa-gerid] execução recusada (mapeamento pendente):', mapaGerid.pendencias);

    const estado = await carregarEstado();
    const atual = estado.execucaoAtual;
    if (atual?.id === id) {
      for (const caso of atual.casos) {
        caso.status = 'erro';
        caso.motivoErro = motivo;
      }
      await persistir();
    }
    await finalizarExecucao(id);
    return;
  }

  const robo = new RoboGeridPlaywright({
    urlGerid: process.env.RPA_GERID_URL ?? 'https://novorequerimento.inss.gov.br/',
    perfilNavegador:
      process.env.RPA_PERFIL_NAVEGADOR ?? path.join(process.cwd(), '.perfil-gerid'),
    headless: process.env.RPA_HEADLESS ? process.env.RPA_HEADLESS === '1' : true,
    pastaSaida: path.join(process.cwd(), 'saida'),
    timeoutMs: Number(process.env.RPA_TIMEOUT_MS ?? 5000),
  });

  /** Marca um caso e persiste. */
  const marcar = async (
    indice: number,
    mudanca: Partial<CasoExecucao>,
  ): Promise<boolean> => {
    const estado = await carregarEstado();
    const atual = estado.execucaoAtual;
    if (!atual || atual.id !== id) return false;
    const caso = atual.casos[indice];
    if (!caso) return false;
    Object.assign(caso, mudanca);
    await persistir();
    return true;
  };

  const descreverErro = (erro: unknown): string => {
    if (erro instanceof ErroGerid) return `[${erro.codigo}] ${erro.message}`;
    return erro instanceof Error ? erro.message : String(erro);
  };

  try {
    await robo.iniciar();

    for (let i = 0; i < prontos.length; i++) {
      const estado = await carregarEstado();
      if (estado.execucaoAtual?.id !== id || estado.execucaoAtual.status !== 'rodando') return;

      if (!(await marcar(i, { status: 'processando' }))) return;

      const pronto = prontos[i]!;
      try {
        const r = await robo.protocolar({
          cliente: pronto.cliente,
          grupoFamiliar: pronto.grupoFamiliar,
          arquivos: pronto.arquivos,
          pastaId: pronto.pastaId,
        }, {
          procuradorCpf: process.env.RPA_CPF_ADVOGADO ?? '00000000000',
          telefone: process.env.RPA_TELEFONE ?? '11999999999',
          email: process.env.RPA_EMAIL ?? 'contato@escritorio.com.br',
          arquivos: pronto.arquivos.map(a => ({ tipo: a.tipo, caminho: a.localPath })),
        });
        await marcar(i, { status: 'sucesso', protocolo: r.protocolo });
      } catch (erro) {
        await marcar(i, { status: 'erro', motivoErro: descreverErro(erro) });

        // Sessão caiu ou o Gerid pediu verificação: parar tudo — insistir só
        // geraria uma fila de erros iguais.
        if (
          erro instanceof ErroGerid &&
          (erro.codigo === FalhaGerid.SESSAO_EXPIRADA ||
            erro.codigo === FalhaGerid.VERIFICACAO_SEGURANCA)
        ) {
          break;
        }
      }
    }
  } catch (erro) {
    // Falhou antes de processar (ex.: sem sessão): marca todos os pendentes.
    const motivo = descreverErro(erro);
    const estado = await carregarEstado();
    const atual = estado.execucaoAtual;
    if (atual?.id === id) {
      for (const caso of atual.casos) {
        if (caso.status === 'pendente' || caso.status === 'processando') {
          caso.status = 'erro';
          caso.motivoErro = motivo;
        }
      }
      await persistir();
    }
  } finally {
    await robo.encerrar().catch(() => undefined);
  }

  await finalizarExecucao(id);
}

/**
 * Fecha a execução: resolve os casos que sobraram, grava o relatório e muda
 * o status. Vale tanto para a execução que rodou quanto para a que foi
 * recusada de saída.
 */
async function finalizarExecucao(id: string): Promise<void> {
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
  atual.status = erro > 0 && sucesso === 0 ? 'erro' : 'concluida';
  await persistir();
}
