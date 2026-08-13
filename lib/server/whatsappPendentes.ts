import { promises as fs } from 'node:fs';
import path from 'node:path';
import { enviarComprovanteAoOperador } from './whatsapp';
import { registrarOcorrencia } from './diagnostico';

/**
 * Comprovantes que o WhatsApp ainda não aceitou.
 *
 * O protocolo é irreversível e o comprovante é a prova dele. Quando a ponte do
 * WhatsApp cai bem na hora do envio, as tentativas imediatas acabam em segundos
 * — e antes disto existir, o PDF simplesmente sumia: o caso já estava marcado
 * como sucesso, então nada no sistema reprocessava aquele cliente, e ninguém
 * ficava sabendo até dar falta do arquivo semanas depois.
 *
 * Aqui a entrega vira dívida em disco. Sobrevive a restart, a deploy e a queda
 * de internet do servidor, e é cobrada no pulso que a ronda da extensão já bate
 * de cinco em cinco minutos.
 *
 * O PDF vai junto, em base64, em vez de uma referência para o arquivo do
 * painel. É deliberado: a hora em que esta fila mais importa é justamente
 * aquela em que o arquivamento falhou, e uma referência para um arquivo que não
 * existe seria uma dívida impossível de pagar.
 */

const PASTA_PENDENTES = process.env.RPA_WHATSAPP_PENDENTES?.trim()
  || path.join(process.cwd(), '.data', 'whatsapp-pendentes');

/**
 * Quantas vezes cobrar antes de desistir.
 *
 * Com a ronda de 5 minutos, 20 tentativas cobrem mais de uma hora e meia de
 * WhatsApp fora do ar. Passou disso, não é oscilação de rede: é problema que
 * precisa de gente, e insistir para sempre só esconderia isso.
 */
const MAX_TENTATIVAS = 20;

interface ComprovantePendente {
  em: string;
  nome: string;
  cpf: string;
  protocolo: string;
  nomeArquivo: string;
  observacao?: string;
  /** PDF em base64 — a dívida tem que ser autossuficiente. */
  pdf: string;
  tentativas: number;
  ultimoErro?: string;
}

/**
 * Uma cobrança por vez.
 *
 * A ronda bate de 5 em 5 minutos e o reenvio pode demorar mais que isso quando
 * o WhatsApp está ruim. Sem esta trava, duas voltas se cruzariam e o operador
 * receberia o mesmo comprovante duas vezes.
 */
let cobrando = false;

function nomeDoArquivo(cpf: string, protocolo: string): string {
  const seguro = (v: string) => v.replace(/[^a-zA-Z0-9]/g, '') || 'sem';
  return `${seguro(cpf)}__${seguro(protocolo)}.json`;
}

/** Guarda a dívida. Nunca estoura: quem chama está tratando outra falha. */
export async function guardarComprovantePendente(entrada: {
  nome: string;
  cpf: string;
  protocolo: string;
  pdf: Uint8Array;
  nomeArquivo: string;
  observacao?: string;
  erro?: string;
}): Promise<void> {
  try {
    await fs.mkdir(PASTA_PENDENTES, { recursive: true });
    const pendente: ComprovantePendente = {
      em: new Date().toISOString(),
      nome: entrada.nome,
      cpf: entrada.cpf,
      protocolo: entrada.protocolo,
      nomeArquivo: entrada.nomeArquivo,
      observacao: entrada.observacao,
      pdf: Buffer.from(entrada.pdf).toString('base64'),
      tentativas: 0,
      ultimoErro: entrada.erro,
    };
    const destino = path.join(PASTA_PENDENTES, nomeDoArquivo(entrada.cpf, entrada.protocolo));
    const temporario = `${destino}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(pendente), 'utf8');
    await fs.rename(temporario, destino);
    console.log(`[WhatsApp] Comprovante de ${entrada.nome} ficou pendente; vou tentar de novo.`);
  } catch (erro) {
    console.error('[WhatsApp] Nao consegui guardar o comprovante pendente:', erro);
  }
}

async function listar(): Promise<string[]> {
  try {
    const nomes = await fs.readdir(PASTA_PENDENTES);
    return nomes.filter((n) => n.endsWith('.json')).map((n) => path.join(PASTA_PENDENTES, n));
  } catch {
    // Pasta ainda não existe: não há dívida nenhuma, que é o caso normal.
    return [];
  }
}

/**
 * Tenta entregar tudo que ficou devendo.
 *
 * Chamada do pulso da ronda, sem `await` — a fila da extensão não pode esperar
 * o WhatsApp. Devolve quantos saíram só para teste e diagnóstico.
 */
export async function reenviarPendentes(): Promise<number> {
  if (cobrando) return 0;
  cobrando = true;
  let entregues = 0;
  try {
    for (const arquivo of await listar()) {
      let pendente: ComprovantePendente;
      try {
        pendente = JSON.parse(await fs.readFile(arquivo, 'utf8')) as ComprovantePendente;
      } catch {
        // Arquivo ilegível não vira dívida eterna: some e fica registrado.
        await fs.rm(arquivo, { force: true }).catch(() => undefined);
        await registrarOcorrencia({
          origem: 'servidor',
          etapa: 'whatsapp',
          mensagem: 'Um comprovante pendente estava ilegivel e foi descartado.',
          detalhe: arquivo,
        });
        continue;
      }

      const resultado = await enviarComprovanteAoOperador({
        nome: pendente.nome,
        protocolo: pendente.protocolo,
        pdf: Buffer.from(pendente.pdf, 'base64'),
        nomeArquivo: pendente.nomeArquivo,
        observacao: pendente.observacao,
      });

      if (resultado.ok) {
        await fs.rm(arquivo, { force: true }).catch(() => undefined);
        entregues += 1;
        console.log(`[WhatsApp] Comprovante pendente de ${pendente.nome} entregue.`);
        continue;
      }

      pendente.tentativas += 1;
      pendente.ultimoErro = resultado.erro;

      if (pendente.tentativas >= MAX_TENTATIVAS) {
        // Desistir CALADO seria repetir o defeito que esta fila veio corrigir.
        await fs.rm(arquivo, { force: true }).catch(() => undefined);
        await registrarOcorrencia({
          origem: 'servidor',
          etapa: 'whatsapp',
          mensagem:
            `O comprovante do protocolo ${pendente.protocolo} nao foi entregue no WhatsApp `
            + `depois de ${pendente.tentativas} tentativas. O PDF continua no painel.`,
          cpf: pendente.cpf,
          nome: pendente.nome,
          detalhe: pendente.ultimoErro,
        });
        continue;
      }

      await fs.writeFile(arquivo, JSON.stringify(pendente), 'utf8').catch(() => undefined);
      // A ponte está fora do ar: as outras dívidas da fila vão falhar igual, e
      // insistir em todas só multiplica a espera de quem chamou.
      break;
    }
  } finally {
    cobrando = false;
  }
  return entregues;
}

/** Quantos comprovantes ainda devem entrega. Para o painel e para teste. */
export async function contarPendentes(): Promise<number> {
  return (await listar()).length;
}
