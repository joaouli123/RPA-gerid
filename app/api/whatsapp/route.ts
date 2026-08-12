import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { iniciarPareamento, situacaoWhatsapp } from '@/lib/server/whatsapp';

/**
 * Vincular o WhatsApp pelo painel.
 *
 * GET  — como está a ponte: conectada? tem QR para escanear? código na tela?
 * POST — começa o pareamento (`?modo=qr` ou `?modo=codigo`) e volta na hora.
 *
 * O POST não espera o WhatsApp de propósito. Quando esperava, a requisição
 * passava dos 30s do proxy e voltava a página "Bad Gateway" no lugar do JSON —
 * o painel quebrava com "Unexpected token 'B'" e parecia erro do WhatsApp,
 * quando era só a espera. O resultado sai pelo GET, que a tela já consulta.
 *
 * Não há guarda de sessão aqui de propósito: o `middleware.ts` nega tudo que
 * não esteja na lista pública, e `/api/whatsapp` não está. Repetir a checagem
 * aqui daria a impressão de que a rota se protege sozinha.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const situacao = situacaoWhatsapp();

  // O QR vira SVG aqui, no servidor: a string crua do Baileys não é imagem, e
  // desenhar QR no navegador exigiria mais uma biblioteca no bundle do cliente.
  // `M` porque o QR do WhatsApp já é denso — correção alta engorda a matriz e
  // deixa os módulos pequenos demais para a câmera do celular.
  const qrSvg = situacao.qr
    ? await QRCode.toString(situacao.qr, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    : null;

  // A string crua não vai para a tela: quem tem o QR pareia o aparelho, então
  // ela é credencial de sessão, não dado de diagnóstico.
  const { qr: _qr, ...resto } = situacao;
  return NextResponse.json({ ...resto, qrSvg });
}

export async function POST(req: Request) {
  const modo = new URL(req.url).searchParams.get('modo') === 'codigo' ? 'codigo' : 'qr';
  const resultado = iniciarPareamento(modo);
  return NextResponse.json(resultado, { status: resultado.ok ? 202 : 400 });
}
