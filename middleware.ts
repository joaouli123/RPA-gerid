import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from '@/lib/server/sessao';

/**
 * Trava de acesso: NADA é público além do login.
 *
 * O app expõe CPF, laudos médicos e documentos pessoais de pessoas com
 * deficiência. Por isso a regra é "negar por padrão": qualquer rota que não
 * esteja na lista abaixo exige sessão válida — inclusive as rotas de API.
 */

const ROTAS_PUBLICAS = new Set(['/login']);

/** Cabeçalhos de segurança aplicados a toda resposta. */
function comSeguranca(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'DENY'); // impede clickjacking
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // O app não deve ser cacheado por proxy: mostra dado pessoal.
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publica = ROTAS_PUBLICAS.has(pathname);
  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value).catch(() => null);

  // Já logado tentando abrir /login -> manda para o painel.
  if (publica && sessao) {
    return comSeguranca(NextResponse.redirect(new URL('/painel', req.url)));
  }

  if (publica) return comSeguranca(NextResponse.next());

  if (!sessao) {
    // API responde 401 (não faz sentido redirecionar uma chamada de API).
    if (pathname.startsWith('/api/')) {
      return comSeguranca(
        NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 }),
      );
    }
    const destino = new URL('/login', req.url);
    // Guarda para onde a pessoa queria ir, e volta pra lá depois do login.
    if (pathname !== '/') destino.searchParams.set('proxima', pathname);
    return comSeguranca(NextResponse.redirect(destino));
  }

  return comSeguranca(NextResponse.next());
}

export const config = {
  /**
   * Roda em tudo, menos nos assets internos do Next e no favicon.
   * Repare que `/api/...` NÃO está excluído: as APIs também exigem sessão.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
