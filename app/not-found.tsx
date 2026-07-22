import { Botao } from '@/components/ui/Botao';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="text-5xl font-bold text-zinc-300 dark:text-zinc-700">404</div>
      <p className="text-zinc-500 dark:text-zinc-400">Página ou cliente não encontrado.</p>
      <Botao href="/painel">Voltar ao painel</Botao>
    </div>
  );
}
