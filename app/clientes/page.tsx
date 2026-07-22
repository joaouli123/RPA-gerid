import { getClientesProntos, getClientesRevisao } from '@/lib/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { ClienteLista } from '@/components/dominio/ClienteLista';
import { BotaoRecarregar } from '@/components/dominio/BotaoRecarregar';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';

export default async function ClientesPage() {
  const [prontos, revisao] = await Promise.all([
    getClientesProntos(),
    getClientesRevisao(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Clientes"
        descricao="Casos lidos da planilha e do Drive, separados entre prontos e revisão manual."
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <BotaoRecarregar />
            <Botao href="/clientes/novo">
              <Icone nome="check" className="h-4 w-4" />
              Novo cliente
            </Botao>
          </div>
        }
      />
      <ClienteLista prontos={prontos} revisao={revisao} />
    </div>
  );
}

export const dynamic = 'force-dynamic';
