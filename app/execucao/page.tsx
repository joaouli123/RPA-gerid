import { getClientesProntos, getExecucaoEmAndamento } from '@/lib/data';
import { preenchimentoAteConfirmarDisponivel } from '@/src/modulo2/mapaGerid';
import { PageHeader } from '@/components/ui/PageHeader';
import { ExecucaoProgresso } from '@/components/dominio/ExecucaoProgresso';

// O progresso muda no servidor durante o job — nunca servir esta página do cache.
export const dynamic = 'force-dynamic';

export default async function ExecucaoPage() {
  const [prontos, atual] = await Promise.all([getClientesProntos(), getExecucaoEmAndamento()]);
  const casos = prontos.map((c) => ({ cpf: c.cliente.cpf, nome: c.cliente.nome }));

  // O preenchimento automático no Gerid só liga quando o mapeamento das telas
  // estiver implementado e validado. Até lá, a tela avisa em vez de deixar
  // disparar e cair num erro técnico.
  const geridPronto = preenchimentoAteConfirmarDisponivel();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Execução"
        descricao="Dispare o robô para protocolar os casos prontos no Gerid."
      />
      <ExecucaoProgresso inicial={atual} prontos={casos} geridPronto={geridPronto} />
    </div>
  );
}
