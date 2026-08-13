import type { NomeIcone } from '@/components/ui/Icone';

export interface ItemNav {
  href: string;
  rotulo: string;
  icone: NomeIcone;
}

export const navItens: ItemNav[] = [
  { href: '/painel', rotulo: 'Painel', icone: 'painel' },
  { href: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
  { href: '/execucao', rotulo: 'Execução', icone: 'execucao' },
  { href: '/revisao', rotulo: 'Revisão', icone: 'revisao' },
  { href: '/relatorios', rotulo: 'Relatórios', icone: 'relatorios' },
  { href: '/diagnostico', rotulo: 'Diagnóstico', icone: 'alerta' },
  { href: '/configuracoes', rotulo: 'Configurações', icone: 'config' },
];
