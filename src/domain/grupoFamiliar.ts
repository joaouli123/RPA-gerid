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
 * Valida as invariantes do grupo familiar de um cliente.
 * Regras (cada violação vira um MotivoRevisao):
 *   - precisa existir (>= 1 integrante);
 *   - exatamente 1 Titular;
 *   - CPF do Titular (quando informado) == CPF do cliente;
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
  const titulares = gf.integrantes.filter((i) => ehTitular(i.parentesco));

  if (titulares.length === 0) {
    motivos.push(
      motivo(
        CodigoMotivo.GRUPO_FAMILIAR_INVALIDO,
        'Grupo familiar sem nenhum integrante marcado como "Titular".',
        { integrantes: gf.integrantes.length },
      ),
    );
  } else if (titulares.length > 1) {
    motivos.push(
      motivo(
        CodigoMotivo.GRUPO_FAMILIAR_INVALIDO,
        `Grupo familiar com ${titulares.length} "Titular" (deveria ser exatamente 1).`,
        { titulares: titulares.length },
      ),
    );
  } else {
    const titular = titulares[0]!;
    if (titular.cpf && apenasDigitos(titular.cpf) !== apenasDigitos(cliente.cpf)) {
      motivos.push(
        motivo(
          CodigoMotivo.GRUPO_FAMILIAR_INVALIDO,
          `CPF do Titular (${titular.cpf}) diverge do CPF do cliente (${cliente.cpf}).`,
          { cpfTitular: titular.cpf, cpfCliente: cliente.cpf },
        ),
      );
    }
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
