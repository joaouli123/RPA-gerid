'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';

/**
 * Vincular o WhatsApp que entrega os 6 dígitos do 2FA do GERID.
 *
 * Pareamento por CÓDIGO, não por QR: o painel roda no navegador (e em produção
 * fica num servidor remoto), então um QR que só existe no terminal do servidor
 * não serviria para nada. Aqui o operador vê 8 letras e digita no próprio
 * celular.
 *
 * Vale parear o MESMO número que o escritório já usa. Aí o robô conversa na
 * "Mensagem para mim mesmo" do operador: o aviso e o código ficam na conversa
 * dele com ele mesmo, sem precisar de um segundo chip.
 */

interface Situacao {
  configurado: boolean;
  conectado: boolean;
  precisaParear: boolean;
  codigoPareamento: string | null;
  numeroMascarado: string;
  ultimoErro: string | null;
}

export function WhatsappVinculo() {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState('');
  // Enquanto o código está na tela, o pareamento acontece no celular — o painel
  // não recebe evento nenhum. Só perguntando de tempos em tempos dá para saber
  // que conectou e trocar a tela sozinho.
  const consultando = useRef(false);

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
    const relogio = setInterval(() => { void consultar(); }, 4_000);
    return () => clearInterval(relogio);
  }, []);

  async function parear() {
    setPedindo(true);
    setErro('');
    try {
      const resposta = await fetch('/api/whatsapp', { method: 'POST' });
      const corpo = await resposta.json();
      if (!corpo.ok) setErro(corpo.erro || 'Não consegui falar com o WhatsApp.');
      await consultar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setPedindo(false);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              WhatsApp vinculado{' '}
              <span className="font-normal text-emerald-600 dark:text-emerald-400">• conectado</span>
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Número {situacao.numeroMascarado}. Quando o GERID pedir o código, o aviso chega
              nessa conversa e você responde só os 6 dígitos.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold">
        WhatsApp do 2FA{' '}
        <span className="font-normal text-amber-600 dark:text-amber-400">• não vinculado</span>
      </h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Vincula o número {situacao.numeroMascarado} para receber o pedido de código do GERID.
      </p>

      {situacao.codigoPareamento ? (
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
      ) : (
        <div className="mt-4">
          <Botao onClick={() => void parear()} disabled={pedindo}>
            {pedindo ? 'Pedindo código...' : 'Gerar código de pareamento'}
          </Botao>
        </div>
      )}

      {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      {!erro && situacao.ultimoErro && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{situacao.ultimoErro}</p>
      )}
    </Card>
  );
}
