'use client';

import { useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Cliente, Integrante } from '@/src/domain/types';
import { Card } from '@/components/ui/Card';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

const PARENTESCOS = [
  'Titular',
  'Mãe',
  'Pai',
  'Cônjuge',
  'Irmão(ã)',
  'Filho(a)',
  'Avô(ó)',
  'Outro',
];

const ESTADOS_CIVIS = ['solteiro', 'casado', 'viúvo', 'divorciado', 'união estável'];

function integranteVazio(parentesco = 'Outro'): Integrante {
  return { nome: '', parentesco, cpf: '', estadoCivil: '', dataNascimento: '', renda: '' };
}

export function ClienteForm({
  clienteInicial,
  integrantesIniciais,
  edicao,
}: {
  clienteInicial?: Cliente;
  integrantesIniciais?: Integrante[];
  edicao: boolean;
}) {
  const router = useRouter();
  const [salvando, startTransition] = useTransition();
  const [erros, setErros] = useState<string[]>([]);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  // Por padrão o grupo familiar pede só o CPF; os campos extras (parentesco,
  // estado civil, nascimento, renda) ficam atrás deste botão para quem quiser.
  const [mostrarOpcionais, setMostrarOpcionais] = useState(false);

  const [cliente, setCliente] = useState<Cliente>(
    clienteInicial ?? { pasta: '', cpf: '', nome: '', cidade: '', cep: '', telefone: '' },
  );
  const [integrantes, setIntegrantes] = useState<Integrante[]>(
    integrantesIniciais?.length ? integrantesIniciais : [integranteVazio('Titular')],
  );

  const setCampo =
    (chave: keyof Cliente) =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      const valor = e.target.value;
      setCliente((c) => ({ ...c, [chave]: valor }));
      setErros([]);
    };

  function setIntegrante(indice: number, chave: keyof Integrante, valor: string): void {
    setIntegrantes((lista) =>
      lista.map((item, i) => (i === indice ? { ...item, [chave]: valor } : item)),
    );
    setErros([]);
  }

  function adicionarIntegrante(): void {
    // Familiar novo entra só com o CPF (parentesco em branco — escolhido depois).
    setIntegrantes((lista) => [...lista, integranteVazio('')]);
  }

  function removerIntegrante(indice: number): void {
    setIntegrantes((lista) => lista.filter((_, i) => i !== indice));
    setErros([]);
  }

  function salvar(e: FormEvent): void {
    e.preventDefault();
    setErros([]);
    startTransition(async () => {
      try {
        const resposta = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente, integrantes }),
        });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.mensagem || 'Nao foi possivel salvar o cliente.');
        router.push('/clientes');
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErros(msg.split(/(?<=\.)\s+/).filter(Boolean));
      }
    });
  }

  /**
   * Exclusão em dois passos.
   *
   * O primeiro clique só arma a confirmação. Apagar apaga o requerente E o
   * grupo familiar inteiro da planilha do escritório, e daqui não tem desfazer
   * — só restaurando um backup. Um clique errado não pode ser suficiente.
   */
  function pedirExclusao(): void {
    setErros([]);
    setConfirmandoExclusao(true);
  }

  function excluir(): void {
    if (!clienteInicial?.cpf) return;
    setConfirmandoExclusao(false);
    startTransition(async () => {
      try {
        const resposta = await fetch(`/api/clientes/${encodeURIComponent(clienteInicial.cpf)}`, {
          method: 'DELETE',
        });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.mensagem || 'Nao foi possivel excluir o cliente.');
        router.push('/clientes');
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErros([msg]);
      }
    });
  }

  const totalTitulares = integrantes.filter(
    (i) => i.parentesco.trim().toLowerCase() === 'titular',
  ).length;

  return (
    <form onSubmit={salvar} className="space-y-5">
      {erros.length > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <div className="flex items-center gap-2 font-medium">
            <Icone nome="alerta" className="h-4 w-4" />
            Corrija antes de salvar:
          </div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {erros.map((erro, i) => (
              <li key={i}>{erro}</li>
            ))}
          </ul>
        </div>
      )}

      <Bloco titulo="Dados do requerente" descricao="Vão para a aba Clientes da planilha.">
        <Campo rotulo="Nome completo" obrigatorio valor={cliente.nome} onChange={setCampo('nome')} dica="Precisa ser igual ao nome da pasta no Drive." />
        <Campo rotulo="CPF" obrigatorio valor={cliente.cpf} onChange={setCampo('cpf')} dica="Só números. O zero à esquerda é preservado." />
        <Campo rotulo="CEP" obrigatorio valor={cliente.cep} onChange={setCampo('cep')} dica="É o que localiza a agência do INSS." />
        <Campo rotulo="Cidade do protocolo" obrigatorio valor={cliente.cidade} onChange={setCampo('cidade')} />
        <Campo rotulo="Telefone" valor={cliente.telefone ?? ''} onChange={setCampo('telefone')} dica="Em branco usa o telefone do escritório." />
      </Bloco>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Grupo familiar</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Basta o <strong>CPF</strong> de cada pessoa que mora na casa. No INSS, o CadÚnico
              preenche sozinho nome, nascimento e renda; o estado civil entra como{' '}
              <strong>Solteiro</strong> por padrão (muda só se houver certidão de casamento).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tom={totalTitulares === 1 ? 'verde' : 'ambar'}>
              {integrantes.length} pessoa(s)
            </Badge>
            <Botao type="button" variante="secundario" onClick={adicionarIntegrante}>
              + Adicionar familiar
            </Botao>
          </div>
        </div>

        <div className="space-y-3">
          {(() => {
            let contadorFamiliar = 0;
            return integrantes.map((integrante, i) => {
              const titular = integrante.parentesco.trim().toLowerCase() === 'titular';
              if (!titular) contadorFamiliar += 1;
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3',
                    titular
                      ? 'border-blue-300 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/5'
                      : 'border-zinc-200 dark:border-zinc-800',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                      {titular ? 'Requerente' : `Familiar ${contadorFamiliar}`}
                      {titular && <Badge tom="azul" className="ml-2">titular</Badge>}
                    </span>
                    {!titular && (
                      <button
                        type="button"
                        onClick={() => removerIntegrante(i)}
                        className="rounded p-1 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        aria-label={`Remover familiar ${contadorFamiliar}`}
                      >
                        <Icone nome="x" className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <CampoSimples
                      rotulo="CPF"
                      // O CPF do requerente é o mesmo do cadastro acima — mostra
                      // travado para não digitar duas vezes.
                      valor={titular ? cliente.cpf : (integrante.cpf ?? '')}
                      onChange={(v) => setIntegrante(i, 'cpf', v)}
                      somenteLeitura={titular}
                      dica={titular ? 'É o CPF do requerente, lá de cima.' : undefined}
                    />

                    {mostrarOpcionais && (
                      <>
                        <CampoSimples
                          rotulo="Nome"
                          valor={integrante.nome}
                          onChange={(v) => setIntegrante(i, 'nome', v)}
                        />
                        {!titular && (
                          <Selecao
                            rotulo="Parentesco"
                            valor={integrante.parentesco}
                            opcoes={PARENTESCOS}
                            onChange={(v) => setIntegrante(i, 'parentesco', v)}
                            permitirVazio
                          />
                        )}
                        <Selecao
                          rotulo="Estado civil"
                          valor={integrante.estadoCivil ?? ''}
                          opcoes={ESTADOS_CIVIS}
                          onChange={(v) => setIntegrante(i, 'estadoCivil', v)}
                          permitirVazio
                        />
                        <CampoSimples
                          rotulo="Nascimento"
                          tipo="date"
                          valor={integrante.dataNascimento ?? ''}
                          onChange={(v) => setIntegrante(i, 'dataNascimento', v)}
                        />
                        <CampoSimples
                          rotulo="Renda mensal"
                          valor={integrante.renda ?? ''}
                          onChange={(v) => setIntegrante(i, 'renda', v)}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        <button
          type="button"
          onClick={() => setMostrarOpcionais((v) => !v)}
          className="mt-3 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {mostrarOpcionais ? 'Ocultar campos opcionais' : 'Preencher campos opcionais (parentesco, estado civil…)'}
        </button>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={salvando}>
          <Icone nome="check" className="h-4 w-4" />
          {salvando ? 'Gravando na planilha…' : 'Salvar na planilha'}
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => router.push('/clientes')}>
          Cancelar
        </Botao>
        {edicao && !confirmandoExclusao && (
          <Botao type="button" variante="perigo" onClick={pedirExclusao} disabled={salvando}>
            Excluir da planilha
          </Botao>
        )}
      </div>

      {edicao && confirmandoExclusao && (
        <Card>
          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Excluir {clienteInicial?.nome} da planilha?
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Some a linha do requerente e {integrantes.length} integrante(s) do grupo familiar.
              Os arquivos no Drive não são tocados. Daqui não tem desfazer — só restaurando um
              backup da planilha.
            </p>
            <div className="flex flex-wrap gap-3">
              <Botao type="button" variante="perigo" onClick={excluir} disabled={salvando}>
                Sim, excluir
              </Botao>
              <Botao
                type="button"
                variante="secundario"
                onClick={() => setConfirmandoExclusao(false)}
              >
                Não, manter
              </Botao>
            </div>
          </div>
        </Card>
      )}
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
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-semibold">{titulo}</h3>
        {descricao && <p className="text-sm text-zinc-500 dark:text-zinc-400">{descricao}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

const CLASSE_INPUT =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900';

function Campo({
  rotulo,
  valor,
  onChange,
  obrigatorio,
  dica,
}: {
  rotulo: string;
  valor: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  obrigatorio?: boolean;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      <input value={valor} onChange={onChange} className={CLASSE_INPUT} />
      {dica && <span className="mt-1 block text-xs text-zinc-400">{dica}</span>}
    </label>
  );
}

function CampoSimples({
  rotulo,
  valor,
  onChange,
  tipo = 'text',
  somenteLeitura,
  dica,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  tipo?: string;
  somenteLeitura?: boolean;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        readOnly={somenteLeitura}
        className={cn(CLASSE_INPUT, somenteLeitura && 'cursor-not-allowed opacity-70')}
      />
      {dica && <span className="mt-1 block text-xs text-zinc-400">{dica}</span>}
    </label>
  );
}

function Selecao({
  rotulo,
  valor,
  opcoes,
  onChange,
  permitirVazio,
}: {
  rotulo: string;
  valor: string;
  opcoes: string[];
  onChange: (valor: string) => void;
  permitirVazio?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSE_INPUT}
      >
        {permitirVazio && <option value="">—</option>}
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
    </label>
  );
}
