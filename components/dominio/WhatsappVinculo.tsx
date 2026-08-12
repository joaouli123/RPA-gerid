'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';

/**
 * Vincular o WhatsApp que entrega os 6 dígitos do 2FA do GERID.
 *
 * Dois caminhos, porque a situação do operador varia: o QR resolve em segundos
 * para quem está com o celular na mão em frente ao painel; o código de 8 letras
 * serve para quem está longe da tela, com o painel aberto por outra pessoa, ou
 * numa câmera que não colabora.
 *
 * Vale parear o MESMO número que o escritório já usa. Aí o robô conversa na
 * "Mensagem para mim mesmo" do operador: o aviso e o código ficam na conversa
 * dele com ele mesmo, sem precisar de um segundo chip.
 */

interface Situacao {
  configurado: boolean;
  conectado: boolean;
  /** Falta alguém com o celular na frente da tela. Sessão caída NÃO conta. */
  precisaParear: boolean;
  /** Já existe credencial em disco: essa sessão volta sozinha. */
  pareado: boolean;
  reconectando: boolean;
  codigoPareamento: string | null;
  /** SVG pronto — o servidor desenha, para não carregar mais um pacote no navegador. */
  qrSvg: string | null;
  numeroMascarado: string;
  ultimoErro: string | null;
}

export function WhatsappVinculo() {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [pedindo, setPedindo] = useState<'qr' | 'codigo' | null>(null);
  const [erro, setErro] = useState('');
  // O pareamento acontece no celular — o painel não recebe evento nenhum. Só
  // perguntando de tempos em tempos dá para saber que conectou e trocar a tela
  // sozinho. É também o que faz o QR se renovar: o WhatsApp troca a cada ~20s.
  const consultando = useRef(false);
  // O QR aparece sozinho, uma vez por abertura da tela. Antes era preciso saber
  // que existia um botão para pedi-lo: quem abria Configurações via "não
  // vinculado" e nada mais. Uma vez só porque, se o pareamento estiver falhando,
  // repetir o pedido a cada 3s não conserta nada e ainda martela o WhatsApp.
  const qrAutomatico = useRef(false);

  async function consultar() {
    if (consultando.current) return;
    consultando.current = true;
    try {
      const resposta = await fetch('/api/whatsapp', { cache: 'no-store' });
      if (resposta.ok) setSituacao(await resposta.json());
    } catch {
      // Rede oscilando não é motivo para sujar a tela: a próxima volta resolve.
    } finally {
      consultando.current = false;
    }
  }

  useEffect(() => {
    void consultar();
    const relogio = setInterval(() => { void consultar(); }, 3_000);
    return () => clearInterval(relogio);
  }, []);

  useEffect(() => {
    if (!situacao?.configurado || situacao.conectado) return;
    // `precisaParear` já exclui a sessão que só caiu e está voltando — pedir QR
    // ali derrubaria a credencial boa que está em disco.
    if (!situacao.precisaParear) return;
    if (situacao.qrSvg || situacao.codigoPareamento) return;
    if (qrAutomatico.current) return;
    qrAutomatico.current = true;
    void parear('qr');
  }, [situacao]);

  async function parear(modo: 'qr' | 'codigo') {
    setPedindo(modo);
    setErro('');
    try {
      const resposta = await fetch(`/api/whatsapp?modo=${modo}`, { method: 'POST' });
      // Resposta que não é JSON quer dizer proxy no meio (502/504), não WhatsApp.
      const corpo = await resposta.json().catch(() => null);
      if (!corpo?.ok) setErro(corpo?.erro || 'O servidor não aceitou o pedido de pareamento.');
      await consultar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setPedindo(null);
    }
  }

  if (!situacao) return null;

  if (!situacao.configurado) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold">WhatsApp do 2FA</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Falta definir <code className="font-mono">RPA_WHATSAPP_NUMERO</code> no servidor
          (só dígitos, com DDI — ex.: 5584999999999). O número não fica no código.
        </p>
      </Card>
    );
  }

  if (situacao.conectado) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold">
          WhatsApp vinculado{' '}
          <span className="font-normal text-emerald-600 dark:text-emerald-400">• conectado</span>
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Número {situacao.numeroMascarado}. Quando o GERID pedir o código, o aviso chega
          nessa conversa e você responde só os 6 dígitos.
        </p>
      </Card>
    );
  }

  // Sessão pareada que caiu: ela volta sozinha, sem QR e sem ninguém na frente
  // da tela. Mostrar "não vinculado" aqui fazia o operador escanear um código
  // por nada — e escanear DERRUBA a credencial que estava só voltando.
  if (situacao.pareado && !situacao.qrSvg && !situacao.codigoPareamento) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold">
          WhatsApp vinculado{' '}
          <span className="font-normal text-amber-600 dark:text-amber-400">
            • {situacao.reconectando ? 'reconectando' : 'fora do ar'}
          </span>
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Número {situacao.numeroMascarado} continua pareado — a conexão volta sozinha, não
          precisa escanear nada.
        </p>
        {situacao.ultimoErro && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{situacao.ultimoErro}</p>
        )}
        <div className="mt-4">
          <Botao
            variante="secundario"
            onClick={() => void parear('qr')}
            disabled={pedindo !== null}
          >
            {pedindo === 'qr' ? 'Gerando...' : 'Parear outro número'}
          </Botao>
        </div>
        {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      </Card>
    );
  }

  const esperando = situacao.qrSvg || situacao.codigoPareamento;

  return (
    <Card className="p-4">
      <h3 className="font-semibold">
        WhatsApp do 2FA{' '}
        <span className="font-normal text-amber-600 dark:text-amber-400">• não vinculado</span>
      </h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Vincula o número {situacao.numeroMascarado} para receber o pedido de código do GERID.
      </p>

      {!esperando && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          {pedindo === 'qr' ? 'Gerando o QR code...' : 'Preparando o QR code...'}
        </p>
      )}

      {situacao.qrSvg && (
        <div className="mt-4 space-y-3">
          <div
            className="mx-auto w-48 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            // SVG gerado pelo nosso servidor a partir da string do Baileys, não
            // conteúdo de terceiro.
            dangerouslySetInnerHTML={{ __html: situacao.qrSvg }}
          />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>No celular: WhatsApp → Aparelhos conectados → Conectar aparelho</li>
            <li>Aponte a câmera para o código acima</li>
          </ol>
          <p className="text-xs text-zinc-500">
            O código se renova sozinho a cada poucos segundos — pode escanear quando aparecer.
          </p>
        </div>
      )}

      {situacao.codigoPareamento && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Digite no celular</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.3em]">
              {situacao.codigoPareamento}
            </p>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>No celular: WhatsApp → Aparelhos conectados → Conectar aparelho</li>
            <li>Toque em &ldquo;Conectar com número de telefone&rdquo;</li>
            <li>Digite o código acima</li>
          </ol>
          <p className="text-xs text-zinc-500">
            O código vale poucos minutos. Se expirar, gere outro.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Botao onClick={() => void parear('qr')} disabled={pedindo !== null}>
          {pedindo === 'qr' ? 'Gerando...' : esperando ? 'Gerar outro QR code' : 'Mostrar QR code'}
        </Botao>
        <Botao
          variante="secundario"
          onClick={() => void parear('codigo')}
          disabled={pedindo !== null}
        >
          {pedindo === 'codigo' ? 'Pedindo...' : 'Prefiro digitar um código'}
        </Botao>
      </div>

      {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      {!erro && situacao.ultimoErro && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{situacao.ultimoErro}</p>
      )}
    </Card>
  );
}
