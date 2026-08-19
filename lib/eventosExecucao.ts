import type { EventoExecucao, NivelEvento } from '@/lib/types';

/**
 * Teto de linhas guardadas por execucao.
 *
 * O diario e uma janela, nao um arquivo de auditoria: quem investiga uma parada
 * quer as ultimas dezenas de linhas, nao o dia inteiro. O estado do painel vive
 * num JSON unico que e reescrito por inteiro a cada gravacao, entao deixar o
 * relato crescer sem limite encareceria TODA gravacao do sistema, inclusive as
 * que nao tem nada a ver com log.
 */
export const MAX_EVENTOS = 400;

/** Uma linha crua, do jeito que a extensao manda. */
export interface EventoBruto {
  mensagem: string;
  em?: string;
  cpf?: string;
}

// `n[a](consegui|encontrei|...)` em vez de listar `nao consegui` sozinho: a
// extensao escreve a mesma ma noticia de meia duzia de formas ("nao encontrei o
// municipio", "nao localizei o botao", "nao foi possivel abrir"), e uma lista
// fechada de verbos deixaria a linha que EXPLICA a parada pintada de cinza, no
// meio da rotina — que e exatamente o buraco que este diario veio tapar.
const ERRO = /\b(falhou|falha|erro|n[aã]o (consegui|encontrei|localizei|achei|apareceu|carregou|foi poss[ií]vel|existe)|impedid|bloquei|recusad|expirou|expirada|interrompid|abortad|timeout|parou|travou|desisti)\b/i;
const SUCESSO = /\b(protocolado|protocolo\s+\d|sucesso|conclu[ií]d|finalizad[ao] com|salvo|enviado no whatsapp)\b/i;
const AVISO = /\b(aten[cç][aã]o|aviso|revis|confirme|aguardando|pendente|manual|tentando de novo|nova tentativa|pausad)\b/i;

/**
 * Que peso esta linha tem.
 *
 * Classificar no servidor, e nao na extensao, e de proposito: a extensao ja
 * escreve as mensagens em portugues corrido para o operador, e obrigar cada uma
 * das ~200 chamadas de `sendLog` a declarar um nivel seria garantir que metade
 * ficasse com o nivel errado. Aqui a regra e uma so e da para corrigir num
 * lugar.
 *
 * A ordem importa: "protocolado" ganha de "falhou" porque a frase que contem os
 * dois e quase sempre "protocolado, mas o comprovante falhou" — e essa e uma
 * boa noticia com uma ressalva, nao um fracasso.
 */
export function nivelDoEvento(mensagem: string): NivelEvento {
  if (SUCESSO.test(mensagem)) return 'sucesso';
  if (ERRO.test(mensagem)) return 'erro';
  if (AVISO.test(mensagem)) return 'aviso';
  return 'info';
}

/**
 * O numero do passo do formulario, quando a mensagem carrega a marca `[P7]`.
 *
 * O robo ja etiqueta assim os pontos do preenchimento. Extrair o numero permite
 * a tela dizer "parou no passo 9 de 10" em vez de so repetir o texto — e passo
 * e exatamente a informacao que faltava quando o IAGO travou.
 */
export function passoDoEvento(mensagem: string): number | undefined {
  const achado = mensagem.match(/\[P(\d{1,2})\]/);
  if (!achado?.[1]) return undefined;
  const passo = Number(achado[1]);
  return passo >= 1 && passo <= 10 ? passo : undefined;
}

function limpar(texto: unknown): string {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function quando(em: unknown): string {
  const data = new Date(String(em ?? ''));
  // Relogio da maquina do operador pode estar torto, mas a ORDEM que ele
  // reporta e a ordem real dos acontecimentos. Data ilegivel vira "agora" em
  // vez de derrubar a linha inteira: perder o relato por causa do carimbo seria
  // jogar fora justamente o que estamos tentando salvar.
  return Number.isNaN(data.getTime()) ? new Date().toISOString() : data.toISOString();
}

/**
 * Normaliza um lote vindo da extensao e joga fora o que nao acrescenta.
 *
 * Repeticao imediata e frequente: a extensao tenta a mesma coisa em laco e
 * escreve a mesma frase a cada volta. Trinta linhas iguais empurram para fora
 * da janela justamente a linha diferente que explica a parada.
 */
export function normalizarEventos(brutos: unknown, anteriores: EventoExecucao[] = []): EventoExecucao[] {
  if (!Array.isArray(brutos)) return [];
  const saida: EventoExecucao[] = [];
  let ultima = anteriores.at(-1)?.mensagem ?? '';

  for (const bruto of brutos.slice(0, MAX_EVENTOS)) {
    const item = (bruto ?? {}) as EventoBruto;
    const mensagem = limpar(item.mensagem);
    if (!mensagem || mensagem === ultima) continue;
    ultima = mensagem;

    const cpf = limpar(item.cpf).replace(/\D/g, '');
    const passo = passoDoEvento(mensagem);
    saida.push({
      em: quando(item.em),
      mensagem,
      nivel: nivelDoEvento(mensagem),
      ...(cpf ? { cpf } : {}),
      ...(passo ? { passo } : {}),
    });
  }
  return saida;
}

/**
 * A ultima linha que explica uma parada, se houver.
 *
 * A tela usa isto para responder "onde travou?" sem obrigar ninguem a ler o
 * diario de tras para frente. Procura de tras para frente e para no primeiro
 * `erro` — mas so ate encontrar um `sucesso` mais recente, porque erro seguido
 * de protocolo e problema resolvido, e mostra-lo como parada atual mandaria o
 * operador investigar algo que ja passou.
 */
export function ondeTravou(eventos: EventoExecucao[] = []): EventoExecucao | null {
  for (let i = eventos.length - 1; i >= 0; i--) {
    const evento = eventos[i];
    if (!evento) continue;
    if (evento.nivel === 'sucesso') return null;
    if (evento.nivel === 'erro') return evento;
  }
  return null;
}
