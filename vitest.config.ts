import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mesmo alias do tsconfig, para os testes importarem "@/..." como o app.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 5s (o padrao) e curto demais para esta suite: boa parte dos testes de DOM
    // sobe um chromium de verdade pelo Playwright, e subir navegador com varios
    // arquivos rodando em paralelo passa disso sozinho. O sintoma era uma falha
    // que trocava de arquivo a cada execucao e sumia ao rodar de novo — o pior
    // tipo, porque ensina a reexecutar em vez de ler. Timeout nao e asserçao:
    // afrouxar aqui nao deixa nenhum teste passar por engano, so para de
    // reprovar quem estava certo e lento.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
