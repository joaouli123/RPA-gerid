import type { ArquivoInfo } from '../src/domain/types';
import { InMemoryDriveGateway, type SementeDrive } from '../src/integrations/drive/inMemoryDrive';
import { InMemorySheetsGateway } from '../src/integrations/sheets/inMemorySheets';

const MB = 1024 * 1024;

function arquivo(id: string, nome: string, mb = 0.4): ArquivoInfo {
  return { id, nome, tamanhoBytes: Math.round(mb * MB), mimeType: 'application/pdf' };
}

/** Os 4 documentos obrigatórios, com os nomes reais usados no Drive. */
function obrigatorios(prefixo: string): ArquivoInfo[] {
  return [
    arquivo(`${prefixo}-termo`, 'Termo de representação.pdf'),
    arquivo(`${prefixo}-proc`, 'Procuração.pdf'),
    arquivo(`${prefixo}-pess`, 'Documentos pessoais.pdf'),
    arquivo(`${prefixo}-oab`, 'OAB.pdf', 1.3),
  ];
}

/** Os 2 facultativos (o escritório costuma anexar, mas não bloqueiam). */
function facultativos(prefixo: string, mbMedicos = 2): ArquivoInfo[] {
  return [
    arquivo(`${prefixo}-med`, 'Documentos médicos.pdf', mbMedicos),
    arquivo(`${prefixo}-cad`, 'Cadastro único.pdf', 0.3),
  ];
}

/**
 * Dataset de demonstração, espelhando a estrutura REAL do Drive do cliente
 * (conferida em 2026-07-20) e exercitando todos os caminhos do Módulo 1:
 *
 *   - ANTONIO -> REVISÃO: laudo médico de 5,6 MB estoura o limite de 5 MB
 *                         (caso real: é o tamanho do arquivo dele hoje)
 *   - MARIA   -> PRONTO : tudo certo, grupo familiar com 2 integrantes
 *   - JOÃO    -> PRONTO : sem os facultativos (não bloqueiam) e com CPF que
 *                         perdeu o zero à esquerda na planilha
 *   - PEDRO   -> REVISÃO: falta a Procuração (obrigatória); grupo de 4
 *   - ANA     -> REVISÃO: CEP em branco
 *   - Cliente Fantasma -> REVISÃO: pasta no Drive sem linha na planilha
 *   - CARLOS EXTRA     -> REVISÃO: linha na planilha sem pasta no Drive
 */
export function criarDemo(
  abaClientes = 'Clientes',
  abaGrupoFamiliar = 'GrupoFamiliar',
): {
  drive: InMemoryDriveGateway;
  sheets: InMemorySheetsGateway;
} {
  const semente: SementeDrive = {
    subpastas: [
      { id: 'p1', nome: 'ANTONIO CARLOS DE SOUZA' },
      { id: 'p2', nome: 'MARIA SOUZA DE OLIVEIRA' },
      { id: 'p3', nome: 'JOÃO SILVA' },
      { id: 'p4', nome: 'PEDRO LIMA' },
      { id: 'p5', nome: 'ANA COSTA' },
      { id: 'p6', nome: 'Cliente Fantasma' },
      // Pasta de destino pós-protocolo — o robô deve IGNORAR (não é cliente).
      { id: 'p7', nome: 'Protocolado' },
    ],
    arquivos: {
      // Laudo de 5,6 MB — acima do limite de 5 MB informado pelo Gerid.
      p1: [...obrigatorios('ant'), ...facultativos('ant', 5.6)],
      p2: [...obrigatorios('mar'), ...facultativos('mar')],
      // Sem os facultativos: continua PRONTO.
      p3: obrigatorios('joa'),
      // Sem a Procuração (obrigatória).
      p4: [
        arquivo('ped-termo', 'Termo de representação.pdf'),
        arquivo('ped-pess', 'Documentos pessoais.pdf'),
        arquivo('ped-oab', 'OAB.pdf', 1.3),
        ...facultativos('ped'),
      ],
      p5: [...obrigatorios('ana'), ...facultativos('ana')],
      p6: [arquivo('fan-pess', 'Documentos pessoais.pdf')],
    },
  };

  // Cabeçalhos como na planilha real ("Cidade do protocolo"), mais o CEP que
  // o Fabrício concordou em incluir. Não há coluna "Pasta": a pasta do Drive
  // é o próprio Nome.
  const linhasClientes: string[][] = [
    ['Nome', 'CPF', 'CEP', 'Cidade do protocolo', 'Estado civil'],
    [
      'ANTONIO CARLOS DE SOUZA',
      '11122233344',
      '40000-000',
      'Salvador',
      'solteiro',
    ],
    ['MARIA SOUZA DE OLIVEIRA', '52998224725', '53000-000', 'Olinda', 'solteira'],
    // CPF com 10 dígitos: a planilha guardou como número e comeu o zero.
    // padronizarCpf recompõe para 09876543210.
    ['JOÃO SILVA', '9876543210', '74000-000', 'Goiânia', 'solteiro'],
    ['PEDRO LIMA', '39053344705', '54000-000', 'Jaboatão dos Guararapes', 'solteiro'],
    ['ANA COSTA', '11122233396', '', 'Recife', 'casada'], // CEP faltando
    ['CARLOS EXTRA', '22233344405', '50000-111', 'Recife', 'solteiro'], // sem pasta
  ];

  const linhasGrupoFamiliar: string[][] = [
    ['cpf_requerente', 'nome', 'parentesco', 'cpf', 'estado_civil', 'data_nascimento', 'renda'],
    // Antônio — mora sozinho.
    [
      '11122233344',
      'ANTONIO CARLOS DE SOUZA',
      'Titular',
      '11122233344',
      'solteiro',
      '1970-02-11',
      '0',
    ],
    // Maria — + mãe.
    ['52998224725', 'MARIA SOUZA DE OLIVEIRA', 'Titular', '52998224725', 'solteira', '1985-05-05', '0'],
    ['52998224725', 'Rita Souza', 'Mãe', '', 'viúva', '1960-03-03', '1412'],
    // João — sozinho (CPF também sem o zero, para casar com a aba Clientes).
    ['9876543210', 'JOÃO SILVA', 'Titular', '9876543210', 'solteiro', '1990-01-01', '0'],
    // Pedro — + mãe + pai + irmão (4 integrantes).
    ['39053344705', 'PEDRO LIMA', 'Titular', '39053344705', 'solteiro', '1995-07-07', '0'],
    ['39053344705', 'Joana Lima', 'Mãe', '', 'casada', '1965-02-02', '1412'],
    ['39053344705', 'José Lima', 'Pai', '', 'casado', '1962-08-08', '1412'],
    ['39053344705', 'Paulo Lima', 'Irmão', '', 'solteiro', '2000-09-09', '0'],
    // Ana.
    ['11122233396', 'ANA COSTA', 'Titular', '11122233396', 'casada', '1992-04-04', '0'],
    // Carlos (sem pasta no Drive).
    ['22233344405', 'CARLOS EXTRA', 'Titular', '22233344405', 'solteiro', '1988-06-06', '0'],
  ];

  // As abas são registradas com os nomes que a config estiver usando, para o
  // demo continuar funcionando mesmo apontando para a planilha real
  // (que tem aba "Planilha1", não "Clientes").
  return {
    drive: new InMemoryDriveGateway(semente),
    sheets: new InMemorySheetsGateway({
      [abaClientes]: linhasClientes,
      [abaGrupoFamiliar]: linhasGrupoFamiliar,
    }),
  };
}
