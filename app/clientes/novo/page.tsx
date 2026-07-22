import { PageHeader } from '@/components/ui/PageHeader';
import { Botao } from '@/components/ui/Botao';
import { ClienteForm } from '@/components/dominio/ClienteForm';

export const dynamic = 'force-dynamic';

export default function NovoClientePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Novo cliente"
        descricao="Os dados são gravados direto na planilha do Google Drive."
        acao={
          <Botao href="/clientes" variante="secundario">
            Voltar
          </Botao>
        }
      />
      <ClienteForm edicao={false} />
    </div>
  );
}
