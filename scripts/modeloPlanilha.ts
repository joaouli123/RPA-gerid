import ExcelJS from 'exceljs';

/**
 * Monta o modelo de planilha para o escritório preencher.
 *
 * Duas abas ligadas pelo CPF do requerente — é isso que dá suporte ao
 * GRUPO FAMILIAR DE TAMANHO VARIÁVEL (mora sozinho, + mãe, + mãe/pai/irmão…).
 *
 * A coluna CPF é formatada como TEXTO de propósito: se o Excel tratar como
 * número, o CPF que começa com zero perde o dígito (09876543210 -> 9876543210).
 */

const FORMATO_TEXTO = '@';

export const CABECALHO_CLIENTES = [
  'Nome',
  'CPF',
  'CEP',
  'Cidade do protocolo',
  'Estado civil',
  'Telefone',
];

const EXEMPLO_CLIENTES = [
  ['ANTONIO CARLOS DE SOUZA', '11122233344', '40000-000', 'Salvador', 'solteiro', ''],
  ['MARIA SOUZA DE OLIVEIRA', '52998224725', '53000-000', 'Olinda', 'solteira', ''],
];

export const CABECALHO_GRUPO = [
  'cpf_requerente',
  'nome',
  'parentesco',
  'cpf',
  'estado_civil',
  'data_nascimento',
  'renda',
];

const EXEMPLO_GRUPO = [
  // Antônio mora sozinho: uma linha só (o próprio requerente).
  [
    '11122233344',
    'ANTONIO CARLOS DE SOUZA',
    'Titular',
    '11122233344',
    'solteiro',
    '1970-02-11',
    '0',
  ],
  // Maria mora com a mãe: duas linhas.
  [
    '52998224725',
    'MARIA SOUZA DE OLIVEIRA',
    'Titular',
    '52998224725',
    'solteira',
    '1985-05-05',
    '0',
  ],
  ['52998224725', 'RITA SOUZA', 'Mãe', '11122233344', 'viúva', '1960-03-03', '1412'],
];

const LEIA_ME: string[] = [
  'Como preencher esta planilha',
  '',
  'ABA "Clientes" — uma linha por requerente.',
  '  Nome                 nome completo; precisa ser IGUAL ao nome da pasta do cliente no Drive',
  '  CPF                  só números; a coluna já está como TEXTO para não perder zero à esquerda',
  '  CEP                  usado para localizar a agência do INSS mais próxima',
  '  Cidade do protocolo  cidade onde o requerimento será protocolado',
  '  Estado civil         solteiro, casado, viúvo...',
  '  Telefone             opcional; em branco usa o telefone padrão do escritório',
  '',
  'ABA "GrupoFamiliar" — uma linha por INTEGRANTE, incluindo o próprio requerente.',
  '  cpf_requerente   CPF do requerente; é o que liga o integrante ao cliente da outra aba',
  '  nome             nome do integrante',
  '  parentesco       use "Titular" para o próprio requerente; senão Mãe, Pai, Irmão(ã), Cônjuge, Filho(a)',
  '  cpf              CPF do integrante (se houver)',
  '  estado_civil     estado civil do integrante',
  '  data_nascimento  formato AAAA-MM-DD',
  '  renda            renda mensal declarada (0 se não tiver)',
  '',
  'IMPORTANTE — o grupo familiar varia de cliente para cliente:',
  '  mora sozinho            -> 1 linha (só o Titular)',
  '  mora com a mãe          -> 2 linhas (Titular + Mãe)',
  '  mora com mãe/pai/irmão  -> 4 linhas (Titular + Mãe + Pai + Irmão)',
  '  Basta acrescentar quantas linhas forem necessárias, repetindo o mesmo cpf_requerente.',
  '',
  'Regras que o robô confere antes de protocolar:',
  '  - cada requerente precisa de exatamente UMA linha com parentesco "Titular"',
  '  - o CPF do Titular tem que ser igual ao CPF do cliente na aba Clientes',
  '  - não pode haver CPF repetido dentro do mesmo grupo familiar',
];

function montarAba(
  workbook: ExcelJS.Workbook,
  nome: string,
  cabecalho: string[],
  linhas: string[][],
  colunasTexto: number[],
): void {
  const aba = workbook.addWorksheet(nome);

  aba.addRow(cabecalho);
  const primeira = aba.getRow(1);
  primeira.font = { bold: true };
  primeira.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  aba.views = [{ state: 'frozen', ySplit: 1 }];

  // CPF (e afins) como TEXTO, para não perder zero à esquerda.
  for (const indice of colunasTexto) {
    aba.getColumn(indice).numFmt = FORMATO_TEXTO;
  }

  for (const linha of linhas) aba.addRow(linha);

  aba.columns.forEach((coluna, i) => {
    const conteudos = [cabecalho[i] ?? '', ...linhas.map((l) => l[i] ?? '')];
    const maior = Math.max(...conteudos.map((c) => c.length));
    coluna.width = Math.min(Math.max(maior + 2, 12), 42);
  });
}

export function montarModelo(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RPA Gerid';

  // Coluna 2 = CPF.
  montarAba(workbook, 'Clientes', CABECALHO_CLIENTES, EXEMPLO_CLIENTES, [2]);
  // Colunas 1 e 4 = cpf_requerente e cpf.
  montarAba(workbook, 'GrupoFamiliar', CABECALHO_GRUPO, EXEMPLO_GRUPO, [1, 4]);

  const instrucoes = workbook.addWorksheet('Leia-me');
  for (const linha of LEIA_ME) instrucoes.addRow([linha]);
  instrucoes.getRow(1).font = { bold: true, size: 14 };
  instrucoes.getColumn(1).width = 100;

  return workbook;
}
