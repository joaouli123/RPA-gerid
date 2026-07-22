# Deploy no Railway

## Variáveis de ambiente

Configurar em **Variables** no serviço do Railway:

| variável | valor | obrigatória |
|---|---|---|
| `RPA_GOOGLE_CREDENTIALS` | o **JSON inteiro** da service account, em uma linha | sim |
| `RPA_PASTA_RAIZ_ID` | id da pasta "Protocolo INSS" no Drive | sim |
| `RPA_SPREADSHEET_ID` | id da planilha `Protocolo.xlsx` | sim |
| `RPA_ABA_CLIENTES` | `Planilha1` (nome da aba de clientes) | sim |
| `RPA_ABA_GRUPO_FAMILIAR` | `GrupoFamiliar` | sim |
| `RPA_LIMITE_ARQUIVO_MB` | `5` | não (padrão 5) |
| `RPA_TELEFONE_PADRAO` | telefone do escritório | não |
| `RPA_PROCURADOR_NOME` | nome do procurador | não |
| `RPA_PROCURADOR_CPF` | CPF do procurador (só dígitos) | não |
| `RPA_PROCURADOR_OAB` | número da OAB | não |
| `RPA_PROCURADOR_EMAIL` | e-mail do escritório | não |

> `RPA_GOOGLE_CREDENTIALS` substitui o `RPA_GOOGLE_KEY_FILE` usado localmente:
> no servidor não há como subir o arquivo de segredo junto com o código.
> Se as variáveis do Google faltarem, o app **não quebra** — ele roda com o
> dataset de exemplo e avisa no Painel.

## Build

O Railway detecta Next.js sozinho. Se precisar declarar:

- **Build:** `pnpm install --frozen-lockfile && pnpm build`
- **Start:** `pnpm start`

O `next start` respeita a variável `PORT` que o Railway injeta.

## ⚠️ Disco efêmero

O Railway recria o container a cada deploy/restart, e **o disco não persiste**.
Isso afeta:

- `.data/estado.json` — histórico de execuções, ações da fila de revisão e
  overrides de configuração **são perdidos** a cada deploy.
- `backups/` — o backup local feito antes da 1ª gravação na planilha **se perde**.

Consequências práticas:

1. O que importa de verdade (clientes e grupo familiar) mora **na planilha do
   Drive**, não no disco do servidor — isso continua seguro.
2. Como o backup local pode não sobreviver, conte com o **histórico de versões
   do próprio Google Drive** para desfazer uma gravação (Arquivo → Histórico de
   versões).
3. Se o histórico de execuções precisar ser permanente, o caminho é trocar
   `lib/server/store.ts` por um banco (o Railway oferece Postgres) — hoje é
   arquivo JSON de propósito, para manter o projeto simples.

## Segurança

- **Nunca** commitar o JSON da service account. Ele entra só como variável de
  ambiente no Railway (e como arquivo em `secrets/`, git-ignored, no local).
- Se a chave vazar, revogue em Google Cloud → IAM → Contas de serviço → Chaves,
  e gere outra.
