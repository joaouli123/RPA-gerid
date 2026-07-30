FROM mcr.microsoft.com/playwright:v1.62.0-jammy

# Define o diretório de trabalho
WORKDIR /app

# Habilita o pnpm
RUN corepack enable

# Copia os arquivos de dependência
COPY package.json pnpm-lock.yaml ./

# Instala as dependências
RUN pnpm install --frozen-lockfile

# Copia o resto do código
COPY . .

# Faz o build do Next.js
RUN pnpm build

# Expõe a porta que o Railway usa
EXPOSE 3000
ENV PORT 3000

# Comando para iniciar o servidor
CMD ["pnpm", "start"]
