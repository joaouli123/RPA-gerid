import { NextResponse } from 'next/server';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';
import { abrirDesafio, consumirCodigo, situacaoDesafio } from '@/lib/server/desafio2fa';
import { avisarOperador, whatsappConfigurado } from '@/lib/server/whatsapp';

/**
 * Ponte entre o robô travado na tela dos 6 dígitos e o celular do operador.
 *
 * POST — o robô avisa que o GERID pediu o código; nós chamamos o operador no
 *        WhatsApp e devolvemos o id do desafio.
 * GET  — o robô fica perguntando se o código já chegou. Vem uma vez só.
 *
 * O código nunca é escrito em log e nunca toca o disco: ele existe em memória
 * pelo tempo entre a mensagem do operador e a digitação no navegador.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  if (!whatsappConfigurado()) {
    return NextResponse.json(
      { sucesso: false, erro: 'RPA_WHATSAPP_NUMERO não configurado no servidor.' },
      { status: 503, headers: corsHeaders },
    );
  }

  const desafio = abrirDesafio();
  const avisou = await avisarOperador(
    '🔐 O GERID pediu autenticação.\n\n'
      + '1. Aprove no app SafeID\n'
      + '2. Abra o Google Authenticator\n'
      + '3. Me responda só os 6 dígitos\n\n'
      + 'Você tem 2 minutos. Depois disso eu peço de novo.',
  );

  // Sem o aviso o operador não tem como saber que precisa agir, e o robô ficaria
  // em polling até o desafio expirar. Melhor falhar agora, dizendo o motivo —
  // o motivo de verdade, vindo da ponte, e não uma frase genérica que serve
  // para tudo e não ajuda em nada.
  if (!avisou.ok) {
    return NextResponse.json(
      { sucesso: false, erro: `Não consegui falar com o WhatsApp do operador. ${avisou.erro ?? ''}`.trim() },
      { status: 502, headers: corsHeaders },
    );
  }

  return NextResponse.json({ sucesso: true, desafio: desafio.id }, { headers: corsHeaders });
}

export async function GET(req: Request) {
  const auth = autorizarExtensao(req);
  if (!auth.ok) {
    return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
  }

  const id = new URL(req.url).searchParams.get('desafio')?.trim();
  if (!id) {
    return NextResponse.json(
      { sucesso: false, erro: 'Informe o desafio.' },
      { status: 400, headers: corsHeaders },
    );
  }

  const codigo = consumirCodigo(id);
  const situacao = situacaoDesafio();
  return NextResponse.json(
    {
      sucesso: true,
      // `null` enquanto o operador não respondeu — o robô continua perguntando.
      codigo,
      aguardando: situacao.aguardando,
      segundosRestantes: situacao.segundosRestantes,
    },
    { headers: corsHeaders },
  );
}
