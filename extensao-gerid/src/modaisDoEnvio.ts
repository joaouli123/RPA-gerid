/**
 * Decide o que fazer com o modal que estiver aberto na hora do envio (passo 10).
 *
 * Esta funcao NAO clica. Ela so devolve a decisao e o botao — quem clica e
 * `confirmarModaisDoEnvio`. A separacao existe para que a regra possa ser
 * testada com modal de verdade na tela sem que o teste dispare o clique que,
 * na tela errada, abandona um requerimento inteiro.
 */
export type TipoDeModalDoEnvio = '' | 'atencao' | 'agendamento' | 'ciente';

export type DecisaoDeModal = {
  tipo: TipoDeModalDoEnvio;
  texto: string;
  algumDialogo: boolean;
  confirmar: HTMLElement | null;
};

/**
 * Mesma normalizacao usada no resto do robo: sem acento, sem caixa, sem espaco
 * duplo. `\s` ja cobre o espaco duro que o GERID usa dentro dos modais, e
 * `\p{M}` remove as marcas que o NFD separa das letras acentuadas.
 */
function norm(valor: string | null | undefined): string {
  return (valor || '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '');
}

function naTela(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  const estilo = window.getComputedStyle(el);
  return estilo.display !== 'none' && estilo.visibility !== 'hidden' &&
    el.getClientRects().length > 0;
}

export function decidirModalDoEnvio(doc: Document): DecisaoDeModal {
  let algumDialogo = false;

  for (const dialogo of Array.from(doc.querySelectorAll('[role="dialog"]'))) {
    if (!naTela(dialogo)) continue;
    algumDialogo = true;
    const texto = (dialogo as HTMLElement).innerText || dialogo.textContent || '';
    const t = norm(texto);
    const recorte = texto.trim().slice(0, 400);
    const botoes = Array.from(dialogo.querySelectorAll('button')).filter(naTela);
    const confirmar = botoes.find((botao) => norm(botao.innerText) === 'confirmar');
    if (!confirmar) continue;

    // 1. Confirmacao final: "Atencao" + Cancelar ao lado do Confirmar.
    if (t.includes('atencao') && botoes.some((b) => norm(b.innerText) === 'cancelar')) {
      return { tipo: 'atencao', texto: recorte, algumDialogo, confirmar };
    }

    // 2. Ciente do agendamento. A frase e a assinatura: nenhum outro modal
    //    do GERID diz que o requerimento ainda nao foi finalizado.
    if (t.includes('requerimento ainda nao foi finalizado')) {
      return { tipo: 'agendamento', texto: recorte, algumDialogo, confirmar };
    }

    // 3. Ciente de botao unico — a regra que faz o robo reconhecer aviso NOVO
    //    sem precisar de codigo novo a cada texto que o INSS inventa.
    //
    //    A trava aqui NAO e o texto, e a CONTAGEM de escolhas: quando o unico
    //    botao com rotulo e "Confirmar", nao existe alternativa para clicar
    //    errado — ou o robo confirma, ou o envio morre ali. Foi o que aconteceu
    //    com o aviso de biometria ("O pedido ainda nao esta concluido. E
    //    necessario realizar o cadastro biometrico do interessado"), que o GERID
    //    passou a exibir em 08/2026.
    //
    //    ⚠️ E por isso que o modal perigoso continua fora: o "Voce criou uma
    //    tarefa, protocolo …, deseja visualizar?" tem Fechar AO LADO do
    //    Confirmar — duas escolhas, entao nunca cai aqui. Botao de fechar so com
    //    icone (sem rotulo) nao conta como escolha.
    const comRotulo = botoes.filter((botao) => norm(botao.innerText).length > 0);
    if (comRotulo.length === 1 && comRotulo[0] === confirmar) {
      return { tipo: 'ciente', texto: recorte, algumDialogo, confirmar };
    }
  }

  return { tipo: '', texto: '', algumDialogo, confirmar: null };
}
