import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.RPA_EXTENSAO_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { sucesso: false, erro: 'Autorizacao da extensao indisponivel.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { sucesso: true, token },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
