import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import {
  desvincularWhatsapp,
  iniciarPareamento,
  manterConexaoViva,
  situacaoWhatsapp,
} from '@/lib/server/whatsapp';

/**
 * Vincular o WhatsApp pelo painel.
 *
 * GET    — como está a ponte: conectada? tem QR para escanear?
 * POST   — pede um QR code e volta na hora.
 * DELETE — solta o número pareado, para outro celular assumir.
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
  // Religa sozinho uma sessão pareada que esteja fora do ar. Sai na hora se já
  // estiver conectada. É aqui porque a tela de configurações consulta esta rota
  // em intervalo — sem isso, a ponte só subiria quando o GERID pedisse o 2FA,
  // que é o pior momento para descobrir que a conexão caiu no deploy da manhã.
  // O `await` é só a leitura da credencial em disco (rápida), não a conexão.
  // É ele que faz a primeira resposta depois de um restart já saber que a
  // sessão é pareada, em vez de mandar a tela abrir um QR desnecessário.
  await manterConexaoViva();

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

export async function POST() {
  const resultado = iniciarPareamento();
  return NextResponse.json(resultado, { status: resultado.ok ? 202 : 400 });
}

/**
 * Diferente do POST, este ESPERA terminar.
 *
 * Aqui a demora é o `logout` no WhatsApp e um `rm` de pasta pequena — coisa de
 * segundos, longe do tempo do proxy. E responder antes da hora seria pior: a
 * tela consulta o status logo depois e leria a ponte ainda de pé, anunciando
 * que a desconexão não funcionou.
 */
export async function DELETE() {
  const resultado = await desvincularWhatsapp();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
