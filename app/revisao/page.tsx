import { getAcoes, getClientesRevisao } from '@/lib/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilaRevisao } from '@/components/dominio/FilaRevisao';
import { BotaoRecarregar } from '@/components/dominio/BotaoRecarregar';

export default async function RevisaoPage() {
  const [revisao, acoes] = await Promise.all([getClientesRevisao(), getAcoes()]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Revisão manual"
        descricao="Casos que não podem ser protocolados automaticamente, agrupados por motivo."
        acao={<BotaoRecarregar />}
      />
      <FilaRevisao revisao={revisao} acoes={acoes} />
    </div>
  );
}

export const dynamic = 'force-dynamic';
