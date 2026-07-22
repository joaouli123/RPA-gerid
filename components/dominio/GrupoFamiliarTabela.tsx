import type { GrupoFamiliar } from '@/src/domain/types';
import { ehTitular } from '@/src/domain/grupoFamiliar';
import { Tabela, THead, TBody, Th, Td } from '@/components/ui/Tabela';
import { Badge } from '@/components/ui/Badge';
import { formatarCpf } from '@/lib/format';

export function GrupoFamiliarTabela({ grupo }: { grupo: GrupoFamiliar }) {
  return (
    <Tabela>
      <THead>
        <tr>
          <Th>Nome</Th>
          <Th>Parentesco</Th>
          <Th>CPF</Th>
          <Th>Estado civil</Th>
          <Th>Nascimento</Th>
          <Th className="text-right">Renda</Th>
        </tr>
      </THead>
      <TBody>
        {grupo.integrantes.map((integrante, idx) => {
          const titular = ehTitular(integrante.parentesco);
          return (
            <tr
              key={`${integrante.nome}-${idx}`}
              className={titular ? 'bg-blue-50/60 dark:bg-blue-500/5' : undefined}
            >
              <Td className="font-medium">{integrante.nome}</Td>
              <Td>
                {titular ? <Badge tom="azul">Titular</Badge> : integrante.parentesco || '—'}
              </Td>
              <Td className="tabular-nums">
                {integrante.cpf ? formatarCpf(integrante.cpf) : '—'}
              </Td>
              <Td>{integrante.estadoCivil ?? '—'}</Td>
              <Td>{integrante.dataNascimento ?? '—'}</Td>
              <Td className="text-right tabular-nums">{integrante.renda ?? '—'}</Td>
            </tr>
          );
        })}
      </TBody>
    </Tabela>
  );
}
