'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { credenciaisValidas } from '@/lib/server/auth';
import { COOKIE_SESSAO, DURACAO_SESSAO_MS, criarSessao } from '@/lib/server/sessao';
import { checarLimite, limparTentativas, registrarFalha } from '@/lib/server/limiteTentativas';
import { derivarOrigem } from '@/lib/server/origem';

/** Mensagem única para credencial errada — não revela se o e-mail existe. */
const CREDENCIAL_INVALIDA = 'E-mail ou senha incorretos.';

/** IP do cliente, para o limite de tentativas. Ver lib/server/origem.ts. */
async function identificarOrigem(): Promise<string> {
  const h = await headers();
  return derivarOrigem((nome) => h.get(nome));
}

export async function acaoEntrar(
  _estadoAnterior: { erro?: string } | null,
  formData: FormData,
): Promise<{ erro?: string }> {
  const email = String(formData.get('email') ?? '');
  const senha = String(formData.get('senha') ?? '');

  const origem = await identificarOrigem();
  const limite = checarLimite(origem);
  if (limite.bloqueado) {
    const minutos = Math.ceil(limite.segundosParaLiberar / 60);
    return { erro: `Muitas tentativas. Tente de novo em ${minutos} minuto(s).` };
  }

  if (!email || !senha) return { erro: 'Informe e-mail e senha.' };

  let ok = false;
  try {
    ok = await credenciaisValidas(email, senha);
  } catch (erro) {
    // Configuração ausente é problema de servidor, não credencial do usuário.
    console.error('[rpa-gerid] falha na configuração de autenticação:', erro);
    return { erro: 'Autenticação não configurada no servidor. Avise o responsável.' };
  }

  if (!ok) {
    const depois = registrarFalha(origem);
    if (depois.bloqueado) {
      return { erro: 'Muitas tentativas. Acesso bloqueado por 15 minutos.' };
    }
    return { erro: CREDENCIAL_INVALIDA };
  }

  limparTentativas(origem);

  const valor = await criarSessao(email.trim().toLowerCase());
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, valor, {
    httpOnly: true, // JS da página não lê o cookie (protege contra XSS)
    sameSite: 'lax', // não vaza em requisição de outro site (CSRF)
    secure: process.env.NODE_ENV === 'production', // só HTTPS em produção
    path: '/',
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
  });

  redirect('/painel');
}

export async function acaoSair(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
  redirect('/login');
}
