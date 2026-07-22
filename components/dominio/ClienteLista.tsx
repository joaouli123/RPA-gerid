'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { ClienteRevisao, ClienteValidado } from '@/src/domain/types';
import { Tabela, THead, TBody, Th, Td } from '@/components/ui/Tabela';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { MotivoBadge } from '@/components/dominio/MotivoBadge';
import { Icone } from '@/components/ui/Icone';
import { cn } from '@/lib/cn';
import { digitosCpf, formatarCpf } from '@/lib/format';

type Aba = 'prontos' | 'revisao';

export function ClienteLista({
  prontos,
  revisao,
}: {
  prontos: ClienteValidado[];
  revisao: ClienteRevisao[];
}) {
  const [aba, setAba] = useState<Aba>('prontos');
  const [busca, setBusca] = useState('');

  const termo = busca.trim().toLowerCase();
  const digitos = busca.replace(/\D+/g, '');

  const prontosFiltrados = useMemo(
    () =>
      prontos.filter((c) => {
        const nome = c.cliente.nome.toLowerCase();
        return (
          !termo ||
          nome.includes(termo) ||
          (digitos.length > 0 && digitosCpf(c.cliente.cpf).includes(digitos))
        );
      }),
    [prontos, termo, digitos],
  );

  const revisaoFiltrada = useMemo(
    () =>
      revisao.filter((c) => {
        const alvo = `${c.pasta} ${c.cpf ?? ''}`.toLowerCase();
        return (
          !termo ||
          alvo.includes(termo) ||
          (digitos.length > 0 && digitosCpf(c.cpf).includes(digitos))
        );
      }),
    [revisao, termo, digitos],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
          <BotaoAba ativo={aba === 'prontos'} onClick={() => setAba('prontos')}>
            Prontos ({prontos.length})
          </BotaoAba>
          <BotaoAba ativo={aba === 'revisao'} onClick={() => setAba('revisao')}>
            Revisão ({revisao.length})
          </BotaoAba>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <Icone nome="clientes" className="h-4 w-4" />
          </span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            className="w-64 max-w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      {aba === 'prontos' ? (
        prontosFiltrados.length === 0 ? (
          <EmptyState titulo="Nenhum cliente pronto" descricao="Ajuste a busca ou verifique a leitura de dados." />
        ) : (
          <Tabela>
            <THead>
              <tr>
                <Th>Cliente</Th>
                <Th>CPF</Th>
                <Th>Grupo familiar</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {prontosFiltrados.map((c) => (
                <tr key={digitosCpf(c.cliente.cpf)} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <Td>
                    <Link
                      href={`/clientes/${digitosCpf(c.cliente.cpf)}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {c.cliente.nome}
                    </Link>
                    <div className="text-xs text-zinc-400">{c.cliente.cidade}</div>
                  </Td>
                  <Td className="tabular-nums">{formatarCpf(c.cliente.cpf)}</Td>
                  <Td>{c.grupoFamiliar.integrantes.length} integrante(s)</Td>
                  <Td>
                    <StatusPill tom="verde">Pronto</StatusPill>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Tabela>
        )
      ) : revisaoFiltrada.length === 0 ? (
        <EmptyState titulo="Nada em revisão" descricao="Todos os casos filtrados estão prontos." />
      ) : (
        <Tabela>
          <THead>
            <tr>
              <Th>Pasta / Cliente</Th>
              <Th>CPF</Th>
              <Th>Motivos</Th>
            </tr>
          </THead>
          <TBody>
            {revisaoFiltrada.map((c, idx) => {
              const cpfDigitos = digitosCpf(c.cpf);
              return (
                <tr key={`${c.pasta}-${idx}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <Td>
                    {cpfDigitos ? (
                      <Link
                        href={`/clientes/${cpfDigitos}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {c.pasta}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.pasta}</span>
                    )}
                  </Td>
                  <Td className="tabular-nums">{c.cpf ? formatarCpf(c.cpf) : '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {c.motivos.map((m, i) => (
                        <MotivoBadge key={i} motivo={m} />
                      ))}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Tabela>
      )}
    </div>
  );
}

function BotaoAba({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition',
        ativo
          ? 'bg-blue-600 text-white'
          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
      )}
    >
      {children}
    </button>
  );
}
