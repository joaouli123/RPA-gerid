import type { Cliente, PastaInfo } from './types';
import { normalizarCabecalho } from './texto';

export interface Associacao {
  /** Pares pasta<->cliente que casaram pelo nome da pasta. */
  pares: { pasta: PastaInfo; cliente: Cliente }[];
  /** Pastas no Drive sem linha correspondente na planilha. */
  pastasSemCliente: PastaInfo[];
  /** Linhas da planilha sem pasta correspondente no Drive. */
  clientesSemPasta: Cliente[];
}

/**
 * Casa subpastas do Drive com linhas da aba Clientes pelo nome da pasta
 * (normalizado: sem acento, minúsculo, espaços/underscores equivalentes).
 * A coluna `pasta` da planilha deve bater com o nome da subpasta do cliente.
 */
export function associar(pastas: PastaInfo[], clientes: Cliente[]): Associacao {
  const clientePorChave = new Map<string, Cliente>();
  for (const c of clientes) {
    const chave = normalizarCabecalho(c.pasta);
    if (chave) clientePorChave.set(chave, c);
  }

  const pares: Associacao['pares'] = [];
  const pastasSemCliente: PastaInfo[] = [];
  const clientesUsados = new Set<Cliente>();

  for (const pasta of pastas) {
    const chave = normalizarCabecalho(pasta.nome);
    const cliente = clientePorChave.get(chave);
    if (cliente) {
      pares.push({ pasta, cliente });
      clientesUsados.add(cliente);
    } else {
      pastasSemCliente.push(pasta);
    }
  }

  const clientesSemPasta = clientes.filter((c) => !clientesUsados.has(c));

  return { pares, pastasSemCliente, clientesSemPasta };
}
