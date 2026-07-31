import type { Cliente, GrupoFamiliar, Integrante } from './types';
import { CodigoMotivo, motivo, type MotivoRevisao } from './motivos';
import { apenasDigitos, normalizarCabecalho } from './texto';

/** Registro cru vindo do parser da aba GrupoFamiliar. */
export interface RegistroIntegrante {
  requerenteCpf: string;
  integrante: Integrante;
}

/**
 * Agrupa os integrantes por CPF do requerente (só dígitos), produzindo
 * um GrupoFamiliar por requerente. É isto que dá suporte natural a grupos
 * de tamanho variável: cada requerente acumula quantas linhas tiver.
 */
export function agruparGrupoFamiliar(
  registros: RegistroIntegrante[],
): Map<string, GrupoFamiliar> {
  const mapa = new Map<string, GrupoFamiliar>();
  for (const { requerenteCpf, integrante } of registros) {
    const chave = apenasDigitos(requerenteCpf);
    if (!chave) continue; // linha sem CPF de requerente é ignorada aqui
    let gf = mapa.get(chave);
    if (!gf) {
      gf = { requerenteCpf: chave, integrantes: [] };
      mapa.set(chave, gf);
    }
    gf.integrantes.push(integrante);
  }
  return mapa;
}

const ROTULOS_TITULAR = new Set([
  'titular',
  'requerente',
  'proprio',
  'propria',
  'o proprio',
  'a propria',
]);

/** True se o parentesco indica o próprio requerente (o "Titular" do grupo). */
export function ehTitular(parentesco: string | undefined): boolean {
  return ROTULOS_TITULAR.has(normalizarCabecalho(parentesco));
}

/**
 * True se o integrante é o próprio requerente: casa pelo CPF (o do cliente) ou,
 * por compatibilidade com dados antigos, pelo rótulo "Titular".
 */
export function ehRequerente(integrante: Integrante, cliente: Cliente): boolean {
  const cpfCliente = apenasDigitos(cliente.cpf);
  return (
    (cpfCliente.length > 0 && apenasDigitos(integrante.cpf) === cpfCliente) ||
    ehTitular(integrante.parentesco)
  );
}

/**
 * Valida as invariantes do grupo familiar de um cliente.
 *
 * Regra simplificada (decisão do escritório, 23/07/2026): **basta o CPF** de
 * cada pessoa da casa. O GERID puxa nome, nascimento e renda do CadÚnico, e o
 * estado civil entra como Solteiro por padrão — então aqui só se cobra o que
 * de fato importa:
 *   - o grupo precisa existir e incluir o próprio requerente (pelo CPF);
 *   - sem CPF duplicado entre integrantes.
 */
export function validarGrupoFamiliar(
  gf: GrupoFamiliar | undefined,
  cliente: Cliente,
): MotivoRevisao[] {
  if (!gf || gf.integrantes.length === 0) {
    return [
      motivo(
        CodigoMotivo.GRUPO_FAMILIAR_AUSENTE,
        `Nenhum integrante de grupo familiar encontrado para o CPF ${cliente.cpf}.`,
        { cpf: cliente.cpf },
      ),
    ];
  }

  const motivos: MotivoRevisao[] = [];

  if (apenasDigitos(cliente.cpf) && !gf.integrantes.some((i) => ehRequerente(i, cliente))) {
    motivos.push(
      motivo(
        CodigoMotivo.GRUPO_FAMILIAR_INVALIDO,
        `O grupo familiar não inclui o próprio requerente (CPF ${cliente.cpf}).`,
        { cpfCliente: cliente.cpf },
      ),
    );
  }

  const cpfs = gf.integrantes.map((i) => apenasDigitos(i.cpf)).filter((c) => c.length > 0);
  const duplicados = cpfs.filter((c, i) => cpfs.indexOf(c) !== i);
  if (duplicados.length > 0) {
    motivos.push(
      motivo(
        CodigoMotivo.GRUPO_FAMILIAR_INVALIDO,
        `CPF duplicado dentro do grupo familiar: ${[...new Set(duplicados)].join(', ')}.`,
        { duplicados: [...new Set(duplicados)] },
      ),
    );
  }

  return motivos;
}
