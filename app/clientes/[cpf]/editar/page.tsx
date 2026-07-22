import { notFound } from 'next/navigation';
import { getClienteParaEdicao } from '@/lib/server/store';
import { PageHeader } from '@/components/ui/PageHeader';
import { Botao } from '@/components/ui/Botao';
import { ClienteForm } from '@/components/dominio/ClienteForm';
import { formatarCpf } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ cpf: string }>;
}) {
  const { cpf } = await params;
  const registro = await getClienteParaEdicao(cpf);
  if (!registro) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={`Editar: ${registro.cliente.nome}`}
        descricao={formatarCpf(registro.cliente.cpf)}
        acao={
          <Botao href={`/clientes/${cpf}`} variante="secundario">
            Voltar
          </Botao>
        }
      />
      <ClienteForm
        clienteInicial={registro.cliente}
        integrantesIniciais={registro.grupoFamiliar.integrantes}
        edicao
      />
    </div>
  );
}
