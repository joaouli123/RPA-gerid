import type { ResultadoLeitura } from '../domain/types';

/**
 * Imprime o resultado do Módulo 1 de forma legível no terminal.
 * (O relatório persistido/estruturado é responsabilidade do Módulo 3.)
 */
export function imprimirResultado(r: ResultadoLeitura): void {
  const linha = '='.repeat(64);
  console.log(linha);
  console.log('RPA Gerid — Módulo 1 (leitura e validação de dados)');
  console.log(linha);
  console.log(
    `Total: ${r.resumo.total}  |  Prontos: ${r.resumo.prontos}  |  Revisão: ${r.resumo.revisao}`,
  );

  console.log(`\n[PRONTOS PARA O GERID] (${r.clientesProntos.length})`);
  if (r.clientesProntos.length === 0) {
    console.log('  (nenhum)');
  }
  for (const c of r.clientesProntos) {
    const parentescos = c.grupoFamiliar.integrantes.map((i) => i.parentesco).join(', ');
    console.log(
      `  [OK] ${c.cliente.nome} (${c.cliente.cpf}) — grupo familiar: ` +
        `${c.grupoFamiliar.integrantes.length} integrante(s) [${parentescos}]`,
    );
  }

  console.log(`\n[PARA REVISÃO MANUAL] (${r.clientesParaRevisao.length})`);
  if (r.clientesParaRevisao.length === 0) {
    console.log('  (nenhum)');
  }
  for (const c of r.clientesParaRevisao) {
    console.log(`  [X] ${c.pasta}${c.cpf ? ` (${c.cpf})` : ''}`);
    for (const m of c.motivos) {
      console.log(`       - [${m.codigo}] ${m.detalhe}`);
    }
  }
  console.log('');
}
