'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';

/**
 * Vincular o WhatsApp que entrega os 6 dígitos do 2FA do GERID.
 *
 * Um caminho só: QR code. Havia também um código de 8 letras para digitar no
 * celular, e ter dois caminhos para a mesma coisa só dava chance de o operador
 * escolher o mais lento. Com o celular na mão, apontar a câmera resolve.
 *
 * O celular que ler o QR é o que vai receber o aviso: o robô fala na "Mensagem
 * para mim mesmo" dessa conta. Não há campo de destino em lugar nenhum, e é de
 * propósito — mandar mensagem para terceiro é o que faz a Meta banir número em
 * cliente não-oficial. Trocar de aparelho é trocar o QR, e mais nada.
 */

interface Situacao {
  conectado: boolean;
  /** Falta alguém com o celular na frente da tela. Sessão caída NÃO conta. */
  precisaParear: boolean;
  /** Já existe credencial em disco: essa sessão volta sozinha. */
  pareado: boolean;
  reconectando: boolean;
  /** SVG pronto — o servidor desenha, para não carregar mais um pacote no navegador. */
  qrSvg: string | null;
  numeroMascarado: string;
  ultimoErro: string | null;
}

/**
 * Intervalo mínimo entre dois pedidos de QR.
 *
 * O QR do WhatsApp expira sozinho e a conexão cai junto — é o ciclo normal, não
 * falha. Enquanto esta tela estiver aberta ela pede outro, e é isso que faz o
 * código voltar sem ninguém clicar em nada. Antes o pedido era UMA vez por
 * abertura: se aquela primeira tentativa morresse, a tela ficava em "Preparando
 * o QR code..." para sempre.
 *
 * A tela aberta é o sinal de que existe alguém esperando — por isso o pedido é
 * daqui e não um laço no servidor, que ficaria martelando o WhatsApp de
 * madrugada com ninguém na frente do painel.
 */
const INTERVALO_ENTRE_QRS = 8_000;

export function WhatsappVinculo() {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState('');
  // Desconectar tem dois cliques de propósito. Um clique errado aqui deixa o
  // GERID sem para onde pedir o código de acesso, no meio de uma fila rodando —
  // e quem estiver longe da mesa não tem como consertar sem o celular na mão.
  const [confirmando, setConfirmando] = useState(false);
  const [desvinculando, setDesvinculando] = useState(false);
  // O pareamento acontece no celular — o painel não recebe evento nenhum. Só
  // perguntando de tempos em tempos dá para saber que conectou e trocar a tela
  // sozinho. É também o que faz o QR se renovar: o WhatsApp troca a cada ~20s.
  const consultando = useRef(false);
  // Quando saiu o último pedido de QR. Antes era um booleano "já pedi": bastava
  // a primeira tentativa cair para a tela nunca mais pedir outro.
  const ultimoPedido = useRef(0);

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
    if (!situacao || situacao.conectado) return;
    // `precisaParear` já exclui a sessão que só caiu e está voltando — pedir QR
    // ali derrubaria a credencial boa que está em disco.
    if (!situacao.precisaParear) return;
    if (situacao.qrSvg) return;
    if (Date.now() - ultimoPedido.current < INTERVALO_ENTRE_QRS) return;
    void pedirQr();
  }, [situacao]);

  async function pedirQr() {
    ultimoPedido.current = Date.now();
    setPedindo(true);
    setErro('');
    try {
      const resposta = await fetch('/api/whatsapp', { method: 'POST' });
      // Resposta que não é JSON quer dizer proxy no meio (502/504), não WhatsApp.
      const corpo = await resposta.json().catch(() => null);
      if (!corpo?.ok) setErro(corpo?.erro || 'O servidor não aceitou o pedido de QR code.');
      await consultar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setPedindo(false);
    }
  }

  /**
   * Solta o número pareado no servidor.
   *
   * Não basta pedir um QR novo: enquanto a credencial estiver em disco, o
   * WhatsApp reconecta na MESMA conta e nenhum código aparece. Trocar de
   * aparelho é desvincular primeiro.
   */
  async function desvincular() {
    setDesvinculando(true);
    setErro('');
    try {
      const resposta = await fetch('/api/whatsapp', { method: 'DELETE' });
      const corpo = await resposta.json().catch(() => null);
      if (!corpo?.ok) setErro(corpo?.erro || 'O servidor não conseguiu desconectar o número.');
      setConfirmando(false);
      await consultar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setDesvinculando(false);
    }
  }

  function trocarDeNumero() {
    if (!confirmando) {
      return (
        <div className="mt-4">
          <Botao variante="secundario" onClick={() => setConfirmando(true)}>
            Desconectar / usar outro número
          </Botao>
        </div>
      );
    }
    return (
      <div className="mt-4 space-y-3">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          O aparelho sai de <em>Aparelhos conectados</em> no celular e o robô fica sem WhatsApp
          até alguém ler o QR novo. Nesse intervalo o GERID não tem para onde pedir o código de
          acesso; comprovantes que não saírem voltam a ser tentados assim que o número novo
          parear.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="perigo" onClick={() => void desvincular()} disabled={desvinculando}>
            {desvinculando ? 'Desconectando...' : 'Sim, desconectar'}
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => setConfirmando(false)}
            disabled={desvinculando}
          >
            Cancelar
          </Botao>
        </div>
      </div>
    );
  }

  if (!situacao) return null;

  if (situacao.conectado) {
    return (
      <Card>
        <h3 className="font-semibold">
          WhatsApp vinculado{' '}
          <span className="font-normal text-emerald-600 dark:text-emerald-400">• conectado</span>
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Número {situacao.numeroMascarado}. Quando o GERID pedir o código, o aviso chega
          nessa conversa e você responde só os 6 dígitos.
        </p>
        {trocarDeNumero()}
        {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      </Card>
    );
  }

  // Sessão pareada que caiu: ela volta sozinha, sem QR e sem ninguém na frente
  // da tela. Mostrar "não vinculado" aqui fazia o operador escanear um código
  // por nada — e escanear DERRUBA a credencial que estava só voltando.
  if (situacao.pareado && !situacao.qrSvg) {
    return (
      <Card>
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
        {/*
          Aqui existia um botão "Parear outro número" que chamava `pedirQr()` — e
          mentia. Com a credencial em disco o WhatsApp reconecta na mesma conta e
          nenhum QR aparece; quem clicava ficava esperando um código que nunca ia
          vir. Trocar de número passa por desvincular, e é só isso que se oferece.
        */}
        {trocarDeNumero()}
        {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      </Card>
    );
  }

  const esperando = Boolean(situacao.qrSvg);

  return (
    <Card>
      <h3 className="font-semibold">
        WhatsApp do 2FA{' '}
        <span className="font-normal text-amber-600 dark:text-amber-400">• não vinculado</span>
      </h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Vincula o número {situacao.numeroMascarado} para receber o pedido de código do GERID.
      </p>

      {!esperando && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          {pedindo ? 'Gerando o QR code...' : 'Preparando o QR code...'}
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Botao onClick={() => void pedirQr()} disabled={pedindo}>
          {pedindo ? 'Gerando...' : esperando ? 'Gerar outro QR code' : 'Gerar QR code'}
        </Botao>
      </div>

      {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      {!erro && situacao.ultimoErro && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{situacao.ultimoErro}</p>
      )}
    </Card>
  );
}
