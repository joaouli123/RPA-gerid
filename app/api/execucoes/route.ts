import { NextResponse } from 'next/server';
import { getExecucoes } from '@/lib/data';

export async function GET() {
  return NextResponse.json(await getExecucoes());
}
