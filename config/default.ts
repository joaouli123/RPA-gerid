import type {
  DocumentoEsperado,
  MapeamentoClientes,
  MapeamentoGrupoFamiliar,
} from '../src/domain/types';

export interface ProcuradorConfig {
  nome: string;
  cpf: string;
  oab: string;
  email: string;
}

export interface AppConfig {
  /** ID da pasta raiz "Protocolo INSS" no Drive. */
  pastaRaizId: string;
  /** ID da planilha "Protocolo". */
  spreadsheetId: string;
  abaClientes: string;
  abaGrupoFamiliar: string;
  /** Limite de tamanho por anexo, em bytes. */
  limiteTamanhoArquivoBytes: number;
  /** Telefone padrão do escritório (usado quando o cliente não tem um). */
  telefonePadrao: string;
  /** Dados fixos do procurador (mesmos para todos os requerimentos). */
  procurador: ProcuradorConfig;
  documentosEsperados: DocumentoEsperado[];
  mapeamentoClientes: MapeamentoClientes;
  mapeamentoGrupoFamiliar: MapeamentoGrupoFamiliar;
  /** Subpastas da raiz que NÃO são clientes (destino, arquivo morto, etc.). */
  pastasIgnoradas: string[];
  /** O que fazer depois de protocolar (Módulo 3). */
  posProtocolo: {
    /** Nome do arquivo do comprovante salvo na pasta do cliente. */
    nomeComprovante: string;
    /** Mover a pasta do cliente para a pasta de concluídos. */
    moverParaProtocolado: boolean;
    nomePastaProtocolado: string;
  };
}

// ---------------------------------------------------------------------------
// Valores confirmados com o cliente (Fabrício) em 2026-07-20, por áudio.
// O que ainda falta está listado em CLAUDE.md -> "TODOs de negócio".
// ---------------------------------------------------------------------------

/** Limite por anexo informado pelo Gerid: 5 MB por arquivo. */
export const LIMITE_TAMANHO_ARQUIVO_MB = 5;

export const configPadrao: AppConfig = {
  pastaRaizId: '',
  spreadsheetId: '',
  abaClientes: 'Clientes',
  abaGrupoFamiliar: 'GrupoFamiliar',
  limiteTamanhoArquivoBytes: LIMITE_TAMANHO_ARQUIVO_MB * 1024 * 1024,

  // Dados reais do escritório vêm do .env (contêm CPF — não versionar).
  telefonePadrao: '(00) 00000-0000',
  procurador: {
    nome: 'TODO: definir RPA_PROCURADOR_NOME no .env',
    cpf: 'TODO: definir RPA_PROCURADOR_CPF no .env',
    oab: 'TODO: definir RPA_PROCURADOR_OAB no .env',
    email: 'TODO: definir RPA_PROCURADOR_EMAIL no .env',
  },

  // Nomes de arquivo conferidos na pasta real do Drive em 2026-07-20.
  // ATENÇÃO: "Procuração" e "Termo de representação" são documentos DIFERENTES,
  // então os padrões não podem se sobrepor.
  documentosEsperados: [
    {
      tipo: 'TERMO_REPRESENTACAO',
      rotulo: 'Termo de representação',
      obrigatorio: true,
      padroes: ['termo', 'representa'],
    },
    {
      tipo: 'PROCURACAO',
      rotulo: 'Procuração',
      obrigatorio: true,
      padroes: ['procuracao'],
    },
    {
      tipo: 'DOCUMENTOS_PESSOAIS',
      rotulo: 'Documentos pessoais (RG/CPF do interessado)',
      obrigatorio: true,
      padroes: ['documento(s)? pessoa', '\\brg\\b', 'identidade', '\\bcpf\\b'],
    },
    {
      tipo: 'OAB',
      rotulo: 'OAB do procurador',
      obrigatorio: true,
      padroes: ['\\boab\\b'],
    },
    {
      tipo: 'DOCUMENTOS_MEDICOS',
      rotulo: 'Documentos médicos',
      obrigatorio: false, // facultativo no Gerid, mas o escritório sempre anexa
      padroes: ['medic', 'laudo', 'atestado', 'exame'],
    },
    {
      tipo: 'CADASTRO_UNICO',
      rotulo: 'Cadastro único (CadÚnico)',
      obrigatorio: false, // facultativo no Gerid, mas o escritório sempre anexa
      padroes: ['cadastro unico', 'cadunico', 'cad unico'],
    },
  ],

  // Cada campo aceita VÁRIOS nomes de coluna: o cabeçalho real de hoje e as
  // variações prováveis. Assim a planilha pode mudar de rótulo sem quebrar.
  // O PRIMEIRO nome de cada lista é o "canônico": é ele que o sistema escreve
  // no cabeçalho ao gravar. Os demais são apelidos aceitos na leitura.
  mapeamentoClientes: {
    // "pasta" é opcional: se a coluna não existir, casa pelo Nome (que é como
    // as pastas do Drive são nomeadas hoje).
    pasta: ['Pasta', 'pasta do cliente'],
    cpf: ['CPF', 'cpf do requerente'],
    nome: ['Nome', 'nome do requerente', 'cliente'],
    cidade: ['Cidade do protocolo', 'cidade'],
    cep: ['CEP', 'cep do protocolo'],
    telefone: ['Telefone', 'celular', 'contato'],
  },

  mapeamentoGrupoFamiliar: {
    cpfRequerente: ['cpf_requerente', 'cpf do requerente', 'cpf titular'],
    nome: ['nome', 'nome do integrante'],
    parentesco: ['parentesco', 'grau de parentesco'],
    cpf: ['cpf', 'cpf do integrante'],
    estadoCivil: ['estado_civil', 'estado civil'],
    dataNascimento: ['data_nascimento', 'data de nascimento', 'nascimento'],
    renda: ['renda', 'renda mensal'],
  },

  // "Protocolado" é o destino de quem já foi protocolado — não é cliente.
  pastasIgnoradas: ['Protocolado'],

  posProtocolo: {
    nomeComprovante: 'comprovante protocolo',
    moverParaProtocolado: true,
    nomePastaProtocolado: 'Protocolado',
  },
};

/** Overlay das variáveis de ambiente sobre a config padrão. */
export function carregarConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const limiteMb = env.RPA_LIMITE_ARQUIVO_MB
    ? Number(env.RPA_LIMITE_ARQUIVO_MB)
    : LIMITE_TAMANHO_ARQUIVO_MB;

  return {
    ...configPadrao,
    pastaRaizId: env.RPA_PASTA_RAIZ_ID ?? configPadrao.pastaRaizId,
    spreadsheetId: env.RPA_SPREADSHEET_ID ?? configPadrao.spreadsheetId,
    abaClientes: env.RPA_ABA_CLIENTES ?? configPadrao.abaClientes,
    abaGrupoFamiliar: env.RPA_ABA_GRUPO_FAMILIAR ?? configPadrao.abaGrupoFamiliar,
    limiteTamanhoArquivoBytes: limiteMb * 1024 * 1024,
    telefonePadrao: env.RPA_TELEFONE_PADRAO ?? configPadrao.telefonePadrao,
    procurador: {
      nome: env.RPA_PROCURADOR_NOME ?? configPadrao.procurador.nome,
      cpf: env.RPA_PROCURADOR_CPF ?? configPadrao.procurador.cpf,
      oab: env.RPA_PROCURADOR_OAB ?? configPadrao.procurador.oab,
      email: env.RPA_PROCURADOR_EMAIL ?? configPadrao.procurador.email,
    },
  };
}
