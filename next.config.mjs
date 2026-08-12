import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  /**
   * Pacotes que o Next NÃO pode empacotar — o Node carrega direto de
   * node_modules, em tempo de execução.
   *
   * O Baileys conversa por WebSocket, e o `ws` mascara cada frame que envia. Em
   * `ws/lib/buffer-util.js` isso é um `require('bufferutil')` — módulo NATIVO —
   * dentro de um try/catch que existe para cair no JS puro quando o nativo não
   * está lá. O webpack empacota esse require e devolve algo que não é o binding:
   * o try/catch passa, e na hora de mascarar o primeiro frame estoura
   * "b.mask is not a function" (`b` é o `bufferUtil` minificado).
   *
   * Em produção isso derrubava a conexão ANTES de o WhatsApp emitir qualquer QR
   * code — a tela ficava em "Preparando o QR code..." sem nada no que se apoiar,
   * porque o erro não vinha do WhatsApp, vinha do nosso build. Módulo com parte
   * nativa não sobrevive a bundler; tem que ficar de fora.
   */
  serverExternalPackages: ['@whiskeysockets/baileys', 'ws'],
  // O core (src/) e a suíte de testes têm seu próprio typecheck via `pnpm typecheck`.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(process.cwd()),
    };
    return config;
  },
};

export default nextConfig;
