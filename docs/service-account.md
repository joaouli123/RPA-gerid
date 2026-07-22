# Service Account do Google (acesso do robô ao Drive)

## ✅ Já feito em 2026-07-20

| item | valor |
|------|-------|
| Projeto GCP | `rpa-gerid` |
| Drive API | ativada |
| Service account | **`rpa-gerid-drive@rpa-gerid.iam.gserviceaccount.com`** |
| Chave JSON | `secrets/service-account.json` (git-ignored) |
| `.env` | `RPA_GOOGLE_KEY_FILE=./secrets/service-account.json` |

> ⚠️ O projeto consumiu a **última vaga da cota** de projetos da conta Google.

## ⏳ O que ainda falta

1. **Sincronizar o relógio do Windows** — ver "Relógio fora de sincronia" no fim deste documento.
   Sem isso o Google recusa a credencial e o app cai nos dados de exemplo.
2. **Compartilhar a pasta** "Protocolo INSS" com
   `rpa-gerid-drive@rpa-gerid.iam.gserviceaccount.com` (papel **Leitor**), caso o teste ainda falhe
   depois de acertar o relógio.

---

## Como foi feito (para refazer, se precisar)

O Fabrício confirmou que **não tem** o JSON da conta que já aparecia compartilhada
(`organizador-drive@organizador-documental.iam.gserviceaccount.com` — foi criada por outro sistema
dele). Por isso criamos uma nova, só para o RPA.

### 1. Criar o projeto e a conta

1. Acesse <https://console.cloud.google.com/>.
2. Crie um projeto (ex.: **rpa-gerid**) ou selecione um existente.
3. Menu **APIs e serviços → Biblioteca**. Ative a **Google Drive API**.
   (A Google Sheets API **não** é necessária: a planilha do escritório é um `.xlsx`,
   que lemos baixando o arquivo pela Drive API.)
4. Menu **IAM e administrador → Contas de serviço → Criar conta de serviço**.
   - Nome: `rpa-gerid`
   - Não é preciso conceder papéis no projeto (o acesso vem do compartilhamento do Drive).
5. Abra a conta criada → aba **Chaves** → **Adicionar chave → Criar nova chave → JSON**.
   O download começa automaticamente.

## 2. Guardar a chave no projeto

1. Crie a pasta `secrets/` na raiz do repositório (já está no `.gitignore`).
2. Salve o arquivo como `secrets/service-account.json`.
3. No `.env`, aponte para ele:

```
RPA_GOOGLE_KEY_FILE=./secrets/service-account.json
```

⚠️ **Nunca** versione esse arquivo nem mande por WhatsApp/e-mail sem necessidade —
ele dá acesso de leitura a todos os documentos compartilhados com a conta.

## 3. Compartilhar a pasta com a conta

1. Copie o e-mail da conta de serviço (algo como
   `rpa-gerid@rpa-gerid-123456.iam.gserviceaccount.com`).
2. No Drive, abra a pasta **Protocolo INSS** → **Compartilhar**.
3. Cole o e-mail e conceda **Leitor**.
   - Se depois o robô precisar salvar o comprovante na pasta do cliente (Módulo 3),
     troque para **Editor**.

## 4. Conferir se funcionou

```bash
pnpm dev
```

Abra o Painel: o indicador no topo deve mudar de **"Dados de exemplo"** para
**"Google conectado"**, e a leitura passa a vir da pasta real.

Se continuar em "Dados de exemplo", confira no `.env`:

- `RPA_GOOGLE_KEY_FILE` aponta para um arquivo que existe;
- `RPA_PASTA_RAIZ_ID` e `RPA_SPREADSHEET_ID` estão preenchidos
  (os IDs reais já estão lá — foram conferidos no Drive em 2026-07-20).

## 🔴 Relógio fora de sincronia (erro `invalid_grant` / `Invalid JWT`)

Se o app mostrar **"Não consegui ler o Google Drive"** com mensagem sobre relógio, o sintoma no log é:

```
invalid_grant: Invalid JWT: Token must be a short-lived token (60 minutes)
and in a reasonable timeframe. Check your iat and exp values in the JWT claim.
```

A service account assina um token com a **hora local**. Se o PC estiver adiantado/atrasado alguns
minutos, o Google rejeita — não é problema de credencial nem de permissão.

Neste PC (2026-07-20) o relógio estava **8 minutos adiantado** porque o **serviço "Horário do
Windows" (w32time) estava parado**.

**Como corrigir** (precisa de administrador):

- Jeito fácil: **Configurações → Hora e idioma → Data e hora → "Sincronizar agora"**
  (deixe "Definir horário automaticamente" ligado).
- Ou, num PowerShell **como Administrador**:

```powershell
net start w32time
w32tm /resync /force
```

Para conferir a defasagem a qualquer momento:

```bash
node -e "fetch('https://www.google.com',{method:'HEAD'}).then(r=>{const s=new Date(r.headers.get('date'));console.log('diferenca:',Math.round((Date.now()-s)/1000),'s')})"
```

Depois de acertar, clique em **"Recarregar dados"** no painel.

## Escopos usados

O robô pede apenas leitura hoje (`src/integrations/google/auth.ts`):

- `https://www.googleapis.com/auth/drive.readonly`

O Módulo 3 (salvar comprovante / mover pasta para `Protocolado/`) vai exigir escopo de escrita —
quando chegar lá, é só ampliar em `ESCOPOS_LEITURA` e reautorizar.
