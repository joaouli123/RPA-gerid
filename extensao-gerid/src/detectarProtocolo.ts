/**
 * Extrai um protocolo somente quando ele aparece associado a um rotulo
 * inequivoco da tela final. Numeros soltos, CPF e CEP nunca sao aceitos.
 */
/**
 * Protocolo lido da TELA DE DETALHE da tarefa (`/tarefas/detalhar_tarefa/…`).
 *
 * Depois de confirmar o aviso de biometria o GERID nao mostra a tela de
 * comprovante: ele salta direto para o detalhamento do requerimento, que e
 * outra pagina. Ali o numero esta num campo ROTULADO, entao nao ha adivinhacao.
 *
 * O rotulo e comparado por igualdade exata de proposito: a mesma tela tem
 * "Unidade de Protocolo", cujo valor e o nome de uma agencia, e um `includes`
 * acabaria lendo texto no lugar do numero.
 */
export function campoDaTelaDeTarefa(doc: Document, rotuloProcurado: string): string {
  if (!doc.querySelector('#tarefas-container')) return '';
  const alvo = rotuloProcurado.trim().toLowerCase();
  for (const rotulo of Array.from(doc.querySelectorAll('.dtp-datagrid-label'))) {
    const nome = (rotulo.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (nome !== alvo) continue;
    const valor = rotulo.parentElement?.querySelector('.dtp-datagrid-value');
    const texto = (valor?.textContent || '').replace(/\s+/g, ' ').trim();
    if (texto) return texto;
  }
  return '';
}

export function protocoloNaTelaDeTarefa(doc: Document): string | null {
  const digitos = campoDaTelaDeTarefa(doc, 'protocolo').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 25 ? digitos : null;
}

export function detectarProtocoloEmTexto(texto: string): string | null {
  const normalizado = String(texto || '').replace(/\s+/g, ' ').trim();
  const padroes = [
    /(?:n[uú]mero\s+d[oe]\s+)?protocolo\s*(?:gerado)?\s*[:#-]?\s*([0-9][0-9.\/-]{7,30})/i,
    /(?:n[uú]mero\s+d[oe]\s+)?requerimento\s*[:#-]\s*([0-9][0-9.\/-]{7,30})/i,
    /(?:n[uú]mero\s+d[oe]\s+)?pedido\s*[:#-]\s*([0-9][0-9.\/-]{7,30})/i,
  ];

  for (const padrao of padroes) {
    const encontrado = normalizado.match(padrao)?.[1];
    if (!encontrado) continue;
    const digitos = encontrado.replace(/\D/g, '');
    if (digitos.length >= 8 && digitos.length <= 25) return encontrado.replace(/[.,;:]+$/, '');
  }
  return null;
}
