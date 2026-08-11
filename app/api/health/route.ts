export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(
    { status: 'ok', release: 'gerid-rpa-1.2.0' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
