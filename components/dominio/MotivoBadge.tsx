import type { MotivoRevisao } from '@/src/domain/motivos';
import { Badge, type Tom } from '@/components/ui/Badge';
import { infoDoMotivo } from '@/lib/motivos';

const TOM: Record<'vermelho' | 'ambar', Tom> = {
  vermelho: 'vermelho',
  ambar: 'ambar',
};

export function MotivoBadge({ motivo }: { motivo: MotivoRevisao }) {
  const info = infoDoMotivo(motivo.codigo);
  return (
    <span title={motivo.detalhe}>
      <Badge tom={TOM[info.tom]}>{info.rotulo}</Badge>
    </span>
  );
}
