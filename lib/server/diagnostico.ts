import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIÁRIO DE OCORRÊNCIAS (somente servidor).
 *
 * O robô roda o dia inteiro sozinho, e é certo que vai encontrar situações que
 * ninguém previu — uma tela nova do GERID, um PDF que não baixa, um campo que
 * mudou de nome. Quando isso acontece às 14h de uma terça e o operador só olha
 * na quinta, a única coisa que resolve é ter o registro guardado: o que ele
 * estava fazendo, com quem, e o que exatamente falhou.
 *
 * Fica em arquivo PRÓPRIO, e não dentro de `estado.json`, de propósito. O
 * estado é reescrito inteiro a cada gravação do job de execução; misturar o
 * histórico de falhas ali significaria que o registro do problema é apagado
 * pelo mesmo mecanismo que está com problema. Aqui o pior caso é perder a
 * última linha, nunca o histórico.
 *
 * ⚠️ Contém dado real (CPF, nome de requerente). É o mesmo grau de sigilo do
 * `.data/estado.json`: vive no disco do servidor, nunca no repositório.
 */

/** Caminho do diário (sobrescrevível para testes). */
const ARQUIVO_OCORRENCIAS =
  process.env.RPA_OCORRENCIAS_ARQUIVO ?? path.join(process.cwd(), '.data', 'ocorrencias.json');

/**
 * Quantas ocorrências ficam guardadas.
 *
 * Não é ilimitado porque o arquivo é lido inteiro a cada gravação, e um erro em
 * laço (o caso que mais importa registrar) encheria o disco justamente quando o
 * sistema já está mal. Quinhentas cobrem semanas de operação normal.
 */
const MAX_OCORRENCIAS = 500;

export interface Ocorrencia {
  em: string;
  /** Quem viu o problema. A extensão vê a tela; o servidor vê o Drive e o WhatsApp. */
  origem: 'extensao' | 'servidor';
  /** Em que ponto do fluxo — `ronda`, `login`, `passo_7`, `comprovante`, `whatsapp`... */
  etapa: string;
  mensagem: string;
  /** De quem era o caso, quando havia um. */
  cpf?: string;
  nome?: string;
  /** Contexto extra para depurar depois (url, etapa da tela, stack). */
  detalhe?: string;
}

/**
 * Registra e devolve. Nunca lança: quem chama está tratando uma falha, e uma
 * segunda falha no ato de anotar a primeira apagaria as duas.
 */
export async function registrarOcorrencia(
  entrada: Omit<Ocorrencia, 'em'> & { em?: string },
): Promise<void> {
  try {
    const anteriores = await listarOcorrencias();
    const nova: Ocorrencia = {
      em: entrada.em ?? new Date().toISOString(),
      origem: entrada.origem,
      etapa: String(entrada.etapa || 'desconhecida').slice(0, 60),
      mensagem: String(entrada.mensagem || '').slice(0, 2000),
      ...(entrada.cpf ? { cpf: entrada.cpf } : {}),
      ...(entrada.nome ? { nome: entrada.nome } : {}),
      ...(entrada.detalhe ? { detalhe: String(entrada.detalhe).slice(0, 4000) } : {}),
    };
    const lista = [nova, ...anteriores].slice(0, MAX_OCORRENCIAS);
    await fs.mkdir(path.dirname(ARQUIVO_OCORRENCIAS), { recursive: true });
    const temporario = `${ARQUIVO_OCORRENCIAS}.${process.pid}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(lista, null, 2), 'utf8');
    await fs.rename(temporario, ARQUIVO_OCORRENCIAS);
  } catch (erro) {
    console.error('[diagnostico] nao consegui registrar a ocorrencia:', erro);
  }
}

/** Mais recentes primeiro. Arquivo ausente ou corrompido devolve lista vazia. */
export async function listarOcorrencias(limite = MAX_OCORRENCIAS): Promise<Ocorrencia[]> {
  try {
    const bruto = await fs.readFile(ARQUIVO_OCORRENCIAS, 'utf8');
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? (lista as Ocorrencia[]).slice(0, limite) : [];
  } catch {
    return [];
  }
}
