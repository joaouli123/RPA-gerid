import type {
  Cliente,
  ColunaMapeada,
  GrupoFamiliar,
  MapeamentoClientes,
  MapeamentoGrupoFamiliar,
} from './types';

/**
 * Converte o domínio de volta em linhas de planilha (o caminho inverso de
 * parsePlanilha). É isto que permite CADASTRAR pelo sistema: o app monta as
 * abas e o XlsxSheetsGateway grava no Drive.
 *
 * O cabeçalho usa sempre o PRIMEIRO apelido de cada coluna — é o nome
 * canônico que o modelo de planilha também usa.
 */

/** Nome canônico da coluna (1º apelido, quando há vários). */
function canonico(coluna: ColunaMapeada): string {
  return Array.isArray(coluna) ? (coluna[0] ?? '') : coluna;
}

export interface ClienteComGrupo {
  cliente: Cliente;
  grupoFamiliar: GrupoFamiliar;
}

export function cabecalhoClientes(mapa: MapeamentoClientes): string[] {
  return [
    canonico(mapa.nome),
    canonico(mapa.cpf),
    canonico(mapa.cep),
    canonico(mapa.cidade),
    canonico(mapa.telefone),
  ];
}

export function cabecalhoGrupoFamiliar(mapa: MapeamentoGrupoFamiliar): string[] {
  return [
    canonico(mapa.cpfRequerente),
    canonico(mapa.nome),
    canonico(mapa.parentesco),
    canonico(mapa.cpf),
    canonico(mapa.estadoCivil),
    canonico(mapa.dataNascimento),
    canonico(mapa.renda),
  ];
}

/** Aba Clientes: cabeçalho + 1 linha por cliente. */
export function serializarClientes(
  registros: ClienteComGrupo[],
  mapa: MapeamentoClientes,
): string[][] {
  return [
    cabecalhoClientes(mapa),
    ...registros.map(({ cliente }) => [
      cliente.nome,
      cliente.cpf,
      cliente.cep,
      cliente.cidade,
      cliente.telefone ?? '',
    ]),
  ];
}

/** Aba GrupoFamiliar: cabeçalho + 1 linha por INTEGRANTE (tamanho variável). */
export function serializarGrupoFamiliar(
  registros: ClienteComGrupo[],
  mapa: MapeamentoGrupoFamiliar,
): string[][] {
  const linhas: string[][] = [cabecalhoGrupoFamiliar(mapa)];

  for (const { cliente, grupoFamiliar } of registros) {
    for (const integrante of grupoFamiliar.integrantes) {
      linhas.push([
        cliente.cpf,
        integrante.nome,
        integrante.parentesco,
        integrante.cpf ?? '',
        integrante.estadoCivil ?? '',
        integrante.dataNascimento ?? '',
        integrante.renda ?? '',
      ]);
    }
  }

  return linhas;
}
