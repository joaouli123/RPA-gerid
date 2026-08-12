FROM mcr.microsoft.com/playwright:v1.62.0-jammy

# Define o diretório de trabalho
WORKDIR /app

# Copia apenas package.json primeiro
COPY package.json ./

# Instala as dependências usando npm para evitar conflitos de bloqueio do pnpm no Docker
RUN npm install --include=dev

# Copia o resto do código
COPY . .

# Carimbo do build: o Coolify passa SOURCE_COMMIT como build arg. Sem isso não
# há como saber, olhando de fora, se a produção está rodando o código de agora
# ou o de três deploys atrás — e "achei que tinha subido" é como um caso volta
# a ser protocolado duas vezes. O SHA não é segredo: é um hash opaco, não dá
# acesso a nada.
ARG SOURCE_COMMIT=desconhecido
ENV RPA_COMMIT=$SOURCE_COMMIT

# Faz o build do Next.js
RUN npm run build

# Expõe a porta que o Railway usa
EXPOSE 3000
ENV PORT=3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
