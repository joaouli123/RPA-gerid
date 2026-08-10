interface PreenchimentoConcluido {
  pronto: boolean;
  telaAtual: string;
  avisos: string[];
}

export interface ResultadoExtensao {
  status: 'revisao' | 'erro';
  erro: string;
}

/** Evita retirar da fila um caso que parou antes da revisão final. */
export function classificarPreenchimento(
  resultado: PreenchimentoConcluido,
): ResultadoExtensao {
  const avisos = resultado.avisos.filter(Boolean).join(' | ');
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
