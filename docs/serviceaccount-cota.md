# Service account não tem cota de armazenamento

Descoberto em 2026-07-22, ao implementar a gravação da planilha.

## O erro

```
Service Accounts do not have storage quota. Leverage shared drives,
or use OAuth delegation instead.
```

## O que isso significa

Uma service account **não é dona de armazenamento** no Google Drive. Na prática:

| operação | funciona? | por quê |
|---|---|---|
| Ler arquivo compartilhado | ✅ | não cria nada |
| **Alterar** arquivo existente (`files.update`) | ✅ | o arquivo já existe e é do usuário |
| **Criar** arquivo novo (`files.create`) | ❌ | precisaria de cota da service account |
| **Copiar** arquivo (`files.copy`) | ❌ | a cópia seria um arquivo novo |
| Mover arquivo entre pastas | ✅ | não cria nada |

Por isso o **cadastro pelo sistema funciona**: ele só altera a planilha que já existe.

## Consequências no projeto

1. **Backup da planilha é local** (`backups/`), e não uma cópia no Drive.
   Restaurar com `pnpm restaurar`.

2. ⚠️ **O Módulo 3 vai esbarrar nisto.** Salvar o comprovante do protocolo na
   pasta do cliente é *criar um arquivo novo* — vai falhar do mesmo jeito.

### Saídas possíveis para o Módulo 3

- **Shared Drive (recomendado):** mover a pasta "Protocolo INSS" para um Drive
  compartilhado. Lá o dono é a organização, não a service account, e a criação
  de arquivos funciona. Requer Google Workspace.
- **OAuth com a conta do escritório:** em vez de service account, o robô usa a
  conta do Fabrício (fluxo de consentimento uma vez, refresh token guardado).
  Funciona em Drive pessoal, mas o token é da pessoa.
- **Salvar o comprovante localmente** e o operador subir manualmente — menos
  automático, mas destrava sem mudar nada de infraestrutura.

Decidir com o cliente antes de começar o Módulo 3.
