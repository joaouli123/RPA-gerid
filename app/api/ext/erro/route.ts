import { NextResponse } from 'next/server';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';
import { listarOcorrencias, registrarOcorrencia } from '@/lib/server/diagnostico';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * A extensão conta ao servidor o que deu errado no navegador.
 *
 * Sem isto, tudo que o robô descobre sozinho vive no log da extensão — que cabe
 * 80 linhas, some quando o Chrome recicla o service worker, e só existe na
 * máquina do operador. Como o robô roda o dia inteiro sem ninguém olhando, é
 * garantido que as situações novas apareçam quando não há ninguém na frente da
 * tela; se não ficarem gravadas do lado do servidor, a informação de que
 * precisamos para corrigir simplesmente não existe mais no dia seguinte.
 *
 * Responde 200 mesmo quando não consegue gravar: quem chama esta rota já está
 * no meio de um erro, e transformar a falha de registro em mais uma falha para
 * a extensão tratar não ajuda ninguém.
 */
export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  try {
    const corpo = await req.json();
    await registrarOcorrencia({
      origem: 'extensao',
      etapa: corpo?.etapa,
      mensagem: corpo?.mensagem,
      cpf: corpo?.cpf,
      nome: corpo?.nome,
      detalhe: corpo?.detalhe,
    });
  } catch (erro) {
    console.error('[api/ext/erro] corpo invalido:', erro);
  }
  return NextResponse.json({ sucesso: true }, { headers: corsHeaders });
}

/** Leitura para o painel. Mesmo token da extensão — não é rota pública. */
export async function GET(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }
  const limite = Number(new URL(req.url).searchParams.get('limite') || 100);
  return NextResponse.json(
    { sucesso: true, ocorrencias: await listarOcorrencias(Number.isFinite(limite) ? limite : 100) },
    { headers: corsHeaders },
  );
}
