import { NextResponse } from 'next/server';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';
import { iniciarExecucao } from '@/lib/server/store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Prepara a fila a partir da propria extensao, sem exigir um segundo clique no painel. */
export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  try {
    const execucao = await iniciarExecucao();
    return NextResponse.json(
      { sucesso: true, idExecucao: execucao.id, total: execucao.casos.length },
      { status: 202, headers: corsHeaders },
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Nao foi possivel preparar a fila.';
    return NextResponse.json(
      // `codigo` existe por causa da ronda: a extensão chama esta rota a cada
      // cinco minutos, para sempre, e na maioria das vezes a resposta certa é
      // "não há nada para fazer agora". Isso é o repouso normal de um dia sem
      // pasta nova, não uma falha — sem um código para distinguir, a extensão
      // só teria o texto da mensagem e trataria o dia inteiro como erro.
      { sucesso: false, codigo: classificar(mensagem), erro: mensagem },
      { status: 422, headers: corsHeaders },
    );
  }
}

/**
 * `iniciarExecucao` recusa por dois motivos que NÃO são defeito: todo mundo já
 * tem protocolo, ou ninguém está pronto ainda. Qualquer outra recusa (fonte de
 * dados não confiável, Drive fora do ar) é problema de verdade e continua
 * chegando como `falha` para acender o alerta.
 */
function classificar(mensagem: string): 'sem_trabalho' | 'falha' {
  return /^Nada a protocolar|^Nenhum cliente est/.test(mensagem) ? 'sem_trabalho' : 'falha';
}
