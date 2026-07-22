# Checklist / Skill — Diagnóstico de falha

Categoriza automaticamente por que cada caso caiu em revisão manual. Espelha o enum
`CodigoMotivo` em `src/domain/motivos.ts` — **mantenha os dois em sincronia**. Esta é a base do
relatório do Módulo 3.

## Motivos do Módulo 1 (leitura de dados)

| Código                     | O que significa                              | Ação sugerida                                  |
|----------------------------|----------------------------------------------|------------------------------------------------|
| `DOCUMENTO_FALTANDO`       | Falta um dos **4 obrigatórios** (Termo, Procuração, Documentos pessoais, OAB). Facultativos não geram este motivo. | Pedir o documento ao cliente / conferir a pasta. |
| `ARQUIVO_GRANDE_DEMAIS`    | Anexo acima de **5 MB** (limite do Gerid).   | Compactar/reduzir o PDF antes de reenviar.      |
| `PASTA_SEM_LINHA_PLANILHA` | Pasta no Drive sem linha na planilha.        | Cadastrar o cliente na aba `Clientes`.          |
| `LINHA_SEM_PASTA`          | Linha na planilha sem pasta no Drive.        | Criar a pasta / corrigir o nome em `pasta`.     |
| `DADOS_INCOMPLETOS`        | Campo obrigatório do requerente vazio/ inválido. | Completar a linha na planilha.               |
| `GRUPO_FAMILIAR_AUSENTE`   | Nenhum integrante para o CPF.                | Preencher a aba `GrupoFamiliar` (ao menos o Titular). |
| `GRUPO_FAMILIAR_INVALIDO`  | Viola invariante (0/2+ titulares, CPF divergente, duplicado). | Corrigir os integrantes na planilha. |

## Motivos do Módulo 2 (Gerid) — a implementar

Categorizar quando o Playwright entrar. Motivos previstos (confirmar nomes/telas no mapeamento real):

- `SESSAO_EXPIRADA` — sessão do Gerid caiu no meio → reautenticar e reprocessar.
- `VERIFICACAO_SEGURANCA` — Gerid pediu verificação (captcha/2FA) → **revisão manual** (não burlar).
- `CAMPO_NAO_ENCONTRADO` — seletor não achou elemento → layout mudou (ver checklist de seletor).
- `ERRO_PREENCHIMENTO` — Gerid rejeitou um valor → dado provavelmente inconsistente.
- `FALHA_UPLOAD` — anexo não subiu → conferir tamanho/formato.
- `FALHA_DOWNLOAD_COMPROVANTE` — protocolo feito mas comprovante não baixou → recuperar manualmente.

## Como usar

1. Todo caminho de erro DEVE gerar um `MotivoRevisao` tipado (nunca só logar e seguir).
2. O relatório agrupa por `codigo` para mostrar padrões (ex.: "8 casos = documento faltando").
3. Ao adicionar um motivo novo: atualize `CodigoMotivo`, esta tabela e um teste que o exercite.
