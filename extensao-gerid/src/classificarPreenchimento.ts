interface PreenchimentoConcluido {
  pronto: boolean;
  telaAtual: string;
  avisos: string[];
  protocolo?: string;
  comprovante?: string;
}

export interface ResultadoExtensao {
  /**
   * `sucesso` é o vocabulário do servidor (`/api/ext/status`), que recusa esse
   * status sem número de protocolo. Usar o mesmo termo aqui deixa a regra "só é
   * sucesso com protocolo" valendo dos DOIS lados — inventar um status novo
   * daria HTTP 400 e o caso ficaria preso na fila para sempre.
   */
  status: 'sucesso' | 'revisao' | 'erro';
  erro: string;
  /** Só existe em `sucesso`: é o número que o GERID devolveu. */
  protocolo?: string;
  comprovante?: string;
}

/** Evita retirar da fila um caso que parou antes da revisão final. */
export function classificarPreenchimento(
  resultado: PreenchimentoConcluido,
): ResultadoExtensao {
  const avisos = resultado.avisos.filter(Boolean).join(' | ');

  // Sucesso é ter o número do protocolo na mão — nunca "cheguei até o fim".
  // Regra do projeto: um caso só vira sucesso quando o Gerid devolve o número.
  const protocolo = (resultado.protocolo || '').trim();
  if (protocolo) {
    return {
      status: 'sucesso',
      erro: avisos,
      protocolo,
      ...(resultado.comprovante ? { comprovante: resultado.comprovante } : {}),
    };
  }

  if (!resultado.pronto || resultado.telaAtual !== 'Confirmar') {
    return {
      status: 'erro',
      erro:
        `O preenchimento parou em "${resultado.telaAtual}" antes da tela Confirmar.` +
        (avisos ? ` ${avisos}` : ''),
    };
  }

  return {
    status: 'revisao',
    erro: avisos || 'Preenchido até Confirmar. Revise os dados e conclua manualmente no Gerid.',
  };
}
