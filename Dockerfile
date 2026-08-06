FROM mcr.microsoft.com/playwright:v1.62.0-jammy

# Define o diretório de trabalho
WORKDIR /app

# Copia apenas package.json primeiro
COPY package.json ./

# Instala as dependências usando npm para evitar conflitos de bloqueio do pnpm no Docker
RUN npm install --include=dev

# Copia o resto do código
COPY . .

# Faz o build do Next.js
RUN npm run build

# Expõe a porta que o Railway usa
EXPOSE 3000
ENV PORT=3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
