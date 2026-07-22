import type { ResultadoLeitura } from '@/src/domain/types';
import { StatCard } from '@/components/ui/StatCard';
import { Icone } from '@/components/ui/Icone';

export function ResumoCards({ resumo }: { resumo: ResultadoLeitura['resumo'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard rotulo="Total de casos" valor={resumo.total} icone={<Icone nome="clientes" />} />
      <StatCard
        rotulo="Prontos p/ Gerid"
        valor={resumo.prontos}
        tom="verde"
        icone={<Icone nome="check" />}
      />
      <StatCard
        rotulo="Em revisão"
        valor={resumo.revisao}
        tom="ambar"
        icone={<Icone nome="alerta" />}
      />
    </div>
  );
}
