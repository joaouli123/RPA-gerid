'use client';

import { useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { AppConfig } from '@/config/default';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { Tabela, THead, TBody, Th, Td } from '@/components/ui/Tabela';
import { cn } from '@/lib/cn';

function ehPlaceholder(valor: string): boolean {
  const v = valor.trim();
  return v === '' || v.toUpperCase().includes('TODO') || /^\(0+\)\s*0/.test(v);
}

export function ConfiguracoesForm({ config }: { config: AppConfig }) {
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();
  const [form, setForm] = useState({
    limiteMB: String(Math.round(config.limiteTamanhoArquivoBytes / (1024 * 1024))),
    telefonePadrao: config.telefonePadrao,
    procNome: config.procurador.nome,
    procCpf: config.procurador.cpf,
    procOab: config.procurador.oab,
    procEmail: config.procurador.email,
    pastaRaizId: config.pastaRaizId,
    spreadsheetId: config.spreadsheetId,
    abaClientes: config.abaClientes,
    abaGrupoFamiliar: config.abaGrupoFamiliar,
  });

  const set = (chave: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setForm((f) => ({ ...f, [chave]: valor }));
    setSalvo(false);
    setErro(null);
  };

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    const limiteMB = Number(form.limiteMB);
    if (!Number.isFinite(limiteMB) || limiteMB <= 0) {
      setErro('O limite por arquivo precisa ser um número maior que zero.');
      return;
    }

    startTransition(async () => {
      try {
        const resposta = await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limiteTamanhoArquivoBytes: Math.round(limiteMB * 1024 * 1024),
            telefonePadrao: form.telefonePadrao,
            procurador: {
              nome: form.procNome,
              cpf: form.procCpf,
              oab: form.procOab,
              email: form.procEmail,
            },
            pastaRaizId: form.pastaRaizId,
            spreadsheetId: form.spreadsheetId,
            abaClientes: form.abaClientes,
            abaGrupoFamiliar: form.abaGrupoFamiliar,
          }),
        });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.mensagem || 'Nao foi possivel salvar as configuracoes.');
        setSalvo(true);
      } catch (err: unknown) {
        setErro(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
      }
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <Bloco titulo="Integração (Google)" descricao="IDs e abas da pasta/planilha no Drive.">
        <Campo rotulo="ID da pasta raiz (Protocolo INSS)" valor={form.pastaRaizId} onChange={set('pastaRaizId')} />
        <Campo rotulo="ID da planilha (Protocolo)" valor={form.spreadsheetId} onChange={set('spreadsheetId')} />
        <Campo rotulo="Aba de clientes" valor={form.abaClientes} onChange={set('abaClientes')} />
        <Campo rotulo="Aba de grupo familiar" valor={form.abaGrupoFamiliar} onChange={set('abaGrupoFamiliar')} />
      </Bloco>

      <Bloco titulo="Limites" descricao="Tamanho máximo por anexo aceito pelo Gerid.">
        <Campo
          rotulo="Limite por arquivo (MB)"
          valor={form.limiteMB}
          onChange={set('limiteMB')}
          tipo="number"
          aviso="Confirmado com o escritório em 20/07/2026: o Gerid aceita até 5 MB por arquivo."
        />
      </Bloco>

      <Bloco titulo="Escritório / Procurador" descricao="Dados fixos usados em todos os requerimentos.">
        <Campo rotulo="Telefone padrão" valor={form.telefonePadrao} onChange={set('telefonePadrao')} />
        <Campo rotulo="Nome do procurador" valor={form.procNome} onChange={set('procNome')} />
        <Campo rotulo="CPF do procurador" valor={form.procCpf} onChange={set('procCpf')} />
        <Campo rotulo="OAB" valor={form.procOab} onChange={set('procOab')} />
        <Campo rotulo="E-mail do escritório" valor={form.procEmail} onChange={set('procEmail')} />
      </Bloco>

      <Bloco
        titulo="Mapeamento da planilha"
        descricao="Como as colunas da planilha viram campos. Ajuste no código (config/default.ts) para casar com a planilha real."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <MapaTabela titulo="Aba Clientes" entradas={aplanar(config.mapeamentoClientes)} />
          <MapaTabela
            titulo="Aba GrupoFamiliar"
            entradas={aplanar(config.mapeamentoGrupoFamiliar)}
          />
        </div>
      </Bloco>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={salvando}>
          <Icone nome="check" className="h-4 w-4" />
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
        {salvo && !salvando && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Configurações salvas. A leitura de dados será refeita com os novos valores.
          </span>
        )}
        {erro && <span className="text-sm text-rose-600 dark:text-rose-400">{erro}</span>}
      </div>
    </form>
  );
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3">
        <h3 className="font-semibold">{titulo}</h3>
        {descricao && <p className="text-sm text-zinc-500 dark:text-zinc-400">{descricao}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  tipo = 'text',
  aviso,
}: {
  rotulo: string;
  valor: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  tipo?: string;
  aviso?: string;
}) {
  const placeholder = ehPlaceholder(valor);
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        onChange={onChange}
        className={cn(
          'mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:bg-zinc-900',
          placeholder
            ? 'border-amber-300 dark:border-amber-500/40'
            : 'border-zinc-300 dark:border-zinc-700',
        )}
      />
      {(aviso || placeholder) && (
        <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
          {aviso ?? 'Falta preencher com o dado real.'}
        </span>
      )}
    </label>
  );
}

/** Cada campo pode aceitar vários nomes de coluna — mostra todos. */
function aplanar(mapa: Record<string, string | string[]>): [string, string][] {
  return Object.entries(mapa).map(([campo, coluna]) => [
    campo,
    Array.isArray(coluna) ? coluna.join(' · ') : coluna,
  ]);
}

function MapaTabela({ titulo, entradas }: { titulo: string; entradas: [string, string][] }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">{titulo}</div>
      <Tabela>
        <THead>
          <tr>
            <Th>Campo</Th>
            <Th>Coluna na planilha</Th>
          </tr>
        </THead>
        <TBody>
          {entradas.map(([campo, coluna]) => (
            <tr key={campo}>
              <Td className="font-medium">{campo}</Td>
              <Td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{coluna}</Td>
            </tr>
          ))}
        </TBody>
      </Tabela>
    </div>
  );
}
