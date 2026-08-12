import { NextResponse } from 'next/server';
import { parearPorCodigo, situacaoWhatsapp } from '@/lib/server/whatsapp';

/**
 * Vincular o WhatsApp pelo painel.
 *
 * GET  — como está a ponte (conectada? tem código de pareamento na tela?).
 * POST — pede ao WhatsApp o código de 8 letras para digitar no celular.
 *
 * Não há guarda de sessão aqui de propósito: o `middleware.ts` nega tudo que
 * não esteja na lista pública, e `/api/whatsapp` não está. Repetir a checagem
 * aqui daria a impressão de que a rota se protege sozinha.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(situacaoWhatsapp());
}

export async function POST() {
  const resultado = await parearPorCodigo();
  // 502: o pedido chegou aqui certo, quem não respondeu foi o WhatsApp.
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
}
