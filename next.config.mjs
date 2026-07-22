/** @type {import('next').NextConfig} */
const nextConfig = {
  // O core (src/) e a suíte de testes têm seu próprio typecheck via `pnpm typecheck`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
