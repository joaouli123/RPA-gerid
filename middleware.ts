import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from '@/lib/server/sessao';

/**
 * Trava de acesso: NADA é público além do login.
 *
 * O app expõe CPF, laudos médicos e documentos pessoais de pessoas com
 * deficiência. Por isso a regra é "negar por padrão": qualquer rota que não
 * esteja na lista abaixo exige sessão válida — inclusive as rotas de API.
 */

const ROTAS_PUBLICAS = new Set(['/login', '/api/health']);

/** Valor aleatório que autoriza os scripts desta resposta (e só desta). */
function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Content-Security-Policy por nonce.
 *
 * Sem `'unsafe-inline'` em script-src: um `<script>` injetado numa página não
 * roda, porque não tem o nonce do pedido. `style-src` ainda precisa de
 * `'unsafe-inline'` (o React escreve estilos inline em alguns componentes),
 * mas estilo não exfiltra dado. Em dev o Next usa `eval` no hot-reload.
 */
function politicaCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Cabeçalhos de segurança aplicados a toda resposta. */
function comSeguranca(res: NextResponse, req: NextRequest, nonce: string): NextResponse {
  const dev = process.env.NODE_ENV !== 'production';
  res.headers.set('Content-Security-Policy', politicaCsp(nonce, dev));
  res.headers.set('X-Frame-Options', 'DENY'); // impede clickjacking
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // O app não deve ser cacheado por proxy: mostra dado pessoal.
  res.headers.set('Cache-Control', 'no-store, max-age=0');

  // HSTS só quando a conexão já é HTTPS (no Railway o TLS termina na borda,
  // então quem diz isso é o x-forwarded-proto). Em localhost fica de fora,
  // senão o navegador passa a recusar http://localhost.
  const protocolo = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  if (protocolo === 'https') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = gerarNonce();

  // O layout lê este cabeçalho para assinar o <script> de tema.
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set('x-nonce', nonce);
  const seguir = () => NextResponse.next({ request: { headers: cabecalhos } });

  const publica = ROTAS_PUBLICAS.has(pathname) || pathname.startsWith('/api/ext/');
  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value).catch(() => null);

  // Já logado tentando abrir /login -> manda para o painel.
  if (ROTAS_PUBLICAS.has(pathname) && sessao) {
    return comSeguranca(NextResponse.redirect(new URL('/painel', req.url)), req, nonce);
  }

  if (publica) return comSeguranca(seguir(), req, nonce);

  if (!sessao) {
    // API responde 401 (não faz sentido redirecionar uma chamada de API).
    if (pathname.startsWith('/api/')) {
      return comSeguranca(
        NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 }),
        req,
        nonce,
      );
    }
    const destino = new URL('/login', req.url);
    // Guarda para onde a pessoa queria ir, e volta pra lá depois do login.
    if (pathname !== '/') destino.searchParams.set('proxima', pathname);
    return comSeguranca(NextResponse.redirect(destino), req, nonce);
  }

  return comSeguranca(seguir(), req, nonce);
}

export const config = {
  /**
   * Roda em tudo, menos nos assets internos do Next e no favicon.
   * Repare que `/api/...` NÃO está excluído: as APIs também exigem sessão.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
