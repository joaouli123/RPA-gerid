import type { Cliente } from './types';
import { CodigoMotivo, motivo, type MotivoRevisao } from './motivos';
import { apenasDigitos } from './texto';

/**
 * Valida os dados fixos do requerente que são obrigatórios para abrir o
 * requerimento. Não valida regra de negócio do Gerid (isso é do Módulo 2),
 * apenas presença/consistência mínima para não protocolar com lixo.
 */
export function validarDadosCliente(cliente: Cliente): MotivoRevisao[] {
  const motivos: MotivoRevisao[] = [];
  const faltando: string[] = [];

  if (!cliente.cpf?.trim()) faltando.push('cpf');
  if (!cliente.nome?.trim()) faltando.push('nome');
  if (!cliente.cidade?.trim()) faltando.push('cidade');
  if (!cliente.cep?.trim()) faltando.push('cep');

  if (faltando.length > 0) {
    motivos.push(
      motivo(
        CodigoMotivo.DADOS_INCOMPLETOS,
        `Campos obrigatórios faltando: ${faltando.join(', ')}.`,
        { campos: faltando },
      ),
    );
  }

  if (cliente.cpf?.trim() && apenasDigitos(cliente.cpf).length !== 11) {
    motivos.push(
      motivo(CodigoMotivo.DADOS_INCOMPLETOS, `CPF inválido (não tem 11 dígitos): ${cliente.cpf}.`, {
        campo: 'cpf',
        valor: cliente.cpf,
      }),
    );
  }

  return motivos;
}
