import type {
  Cliente,
  ColunaMapeada,
  Integrante,
  MapeamentoClientes,
  MapeamentoGrupoFamiliar,
} from './types';
import type { RegistroIntegrante } from './grupoFamiliar';
import { normalizarCabecalho, padronizarCpf } from './texto';

/**
 * Converte a matriz crua (string[][]) devolvida pela SheetsGateway em objetos
 * indexados por cabeçalho normalizado. A 1ª linha é o cabeçalho. Linhas
 * totalmente vazias são descartadas.
 */
export function lerObjetos(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const cabecalhos = (rows[0] ?? []).map(normalizarCabecalho);
  return rows
    .slice(1)
    .filter((linha) => linha.some((celula) => (celula ?? '').toString().trim() !== ''))
    .map((linha) => {
      const obj: Record<string, string> = {};
      cabecalhos.forEach((h, i) => {
        obj[h] = (linha[i] ?? '').toString().trim();
      });
      return obj;
    });
}

/** Todos os nomes aceitos para uma coluna (aceita apelido único ou lista). */
function apelidos(coluna: ColunaMapeada): string[] {
  return (Array.isArray(coluna) ? coluna : [coluna]).map(normalizarCabecalho);
}

/** Lê o primeiro apelido que existir na linha (com valor preenchido). */
function fazerGetter(obj: Record<string, string>) {
  return (coluna: ColunaMapeada): string => {
    for (const nome of apelidos(coluna)) {
      const valor = obj[nome];
      if (valor) return valor;
    }
    return '';
  };
}

/** Conjunto de todas as colunas conhecidas (para separar os campos extras). */
function colunasConhecidas(mapa: Record<string, ColunaMapeada>): Set<string> {
  return new Set(Object.values(mapa).flatMap(apelidos));
}

/** Parseia a aba Clientes usando o mapeamento configurável de colunas. */
export function parseClientes(rows: string[][], mapa: MapeamentoClientes): Cliente[] {
  const conhecidos = colunasConhecidas(mapa);
  return lerObjetos(rows).map((obj) => {
    const get = fazerGetter(obj);
    const camposAdicionais = coletarExtras(obj, conhecidos);
    const nome = get(mapa.nome);
    const cliente: Cliente = {
      // Se a planilha não tiver coluna "pasta", a pasta do Drive é o Nome
      // (é assim que o escritório organiza hoje).
      pasta: get(mapa.pasta) || nome,
      // padronizarCpf recompõe zero à esquerda perdido quando a planilha
      // guarda o CPF como número.
      cpf: padronizarCpf(get(mapa.cpf)),
      nome,
      cidade: get(mapa.cidade),
      cep: get(mapa.cep),
    };
    const telefone = get(mapa.telefone);
    if (telefone) cliente.telefone = telefone;
    if (Object.keys(camposAdicionais).length) cliente.camposAdicionais = camposAdicionais;
    return cliente;
  });
}

/**
 * Parseia a aba GrupoFamiliar. Cada linha é um integrante ligado ao requerente
 * pelo CPF (coluna cpfRequerente). Colunas não mapeadas viram camposAdicionais
 * — é onde vão parar os campos por-integrante do Gerid ainda não confirmados.
 */
export function parseGrupoFamiliar(
  rows: string[][],
  mapa: MapeamentoGrupoFamiliar,
): RegistroIntegrante[] {
  const conhecidos = colunasConhecidas(mapa);
  return lerObjetos(rows).map((obj) => {
    const get = fazerGetter(obj);
    const camposAdicionais = coletarExtras(obj, conhecidos);
    const integrante: Integrante = {
      nome: get(mapa.nome),
      parentesco: get(mapa.parentesco),
    };
    const cpf = padronizarCpf(get(mapa.cpf));
    const estadoCivil = get(mapa.estadoCivil);
    const dataNascimento = get(mapa.dataNascimento);
    const renda = get(mapa.renda);
    if (cpf) integrante.cpf = cpf;
    if (estadoCivil) integrante.estadoCivil = estadoCivil;
    if (dataNascimento) integrante.dataNascimento = dataNascimento;
    if (renda) integrante.renda = renda;
    if (Object.keys(camposAdicionais).length) integrante.camposAdicionais = camposAdicionais;
    return { requerenteCpf: padronizarCpf(get(mapa.cpfRequerente)), integrante };
  });
}

function coletarExtras(
  obj: Record<string, string>,
  conhecidos: Set<string>,
): Record<string, string> {
  const extras: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(obj)) {
    if (!conhecidos.has(chave) && valor) extras[chave] = valor;
  }
  return extras;
}
