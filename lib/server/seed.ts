import type { Execucao } from '@/lib/types';

/**
 * Histórico inicial de execuções (dados de exemplo), usado só na primeira vez
 * que o estado é criado. Depois disso o histórico real, gravado pelas execuções
 * disparadas no app, é que manda.
 */
export function execucoesIniciais(): Execucao[] {
  return [
    {
      id: 'exec-exemplo-2026-07-16',
      dataISO: '2026-07-16T14:30:00',
      total: 2,
      prontos: 2,
      sucesso: 2,
      erro: 0,
      simulado: true,
      casos: [
        { cpf: '111.444.777-35', nome: 'João Silva', status: 'sucesso', protocolo: '2026071600001' },
        { cpf: '529.982.247-25', nome: 'Maria Souza', status: 'sucesso', protocolo: '2026071600002' },
      ],
    },
    {
      id: 'exec-exemplo-2026-07-15',
      dataISO: '2026-07-15T10:05:00',
      total: 3,
      prontos: 3,
      sucesso: 2,
      erro: 1,
      simulado: true,
      casos: [
        { cpf: '111.444.777-35', nome: 'João Silva', status: 'sucesso', protocolo: '2026071500001' },
        { cpf: '529.982.247-25', nome: 'Maria Souza', status: 'sucesso', protocolo: '2026071500002' },
        {
          cpf: '390.533.447-05',
          nome: 'Pedro Lima',
          status: 'erro',
          motivoErro: 'Sessão do Gerid expirada durante o preenchimento.',
        },
      ],
    },
  ];
}
