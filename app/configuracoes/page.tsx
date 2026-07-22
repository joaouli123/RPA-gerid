import { getConfig } from '@/lib/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfiguracoesForm } from '@/components/dominio/ConfiguracoesForm';

export default async function ConfiguracoesPage() {
  const config = await getConfig();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Configurações"
        descricao="Parâmetros do robô. Campos em âmbar ainda precisam do dado real."
      />
      <ConfiguracoesForm config={config} />
    </div>
  );
}

export const dynamic = 'force-dynamic';
