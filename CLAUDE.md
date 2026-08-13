# CLAUDE.md — RPA Gerid

Memória persistente do projeto entre sessões do Claude Code. Leia isto antes de mexer no código.

## O que é

RPA que **protocola requerimentos de BPC/LOAS** (Benefício Assistencial à Pessoa com Deficiência)
no **Gerid (INSS/Dataprev)**, lendo dados e documentos organizados no Google Drive de cada cliente.
Uso legítimo: escritório com procuração (Termo de Representação + OAB) protocolando em nome de clientes.
O robô **assume uma sessão já autenticada** no Gerid (login manual pelo operador) e **não burla**
verificações de segurança — casos com verificação de segurança vão para revisão manual.

## Stack

- **Node 20 + TypeScript** (ESM). Escolhido por: familiaridade do dev (JS/Node), Node já instalado
  (Python não), Playwright/googleapis first-class em Node, uma língua só no codebase.
- **pnpm** (gerência), **vitest** (testes), **tsx** (roda TS direto), **@googleapis/drive** +
  **@googleapis/sheets** + **google-auth-library** (integração real).
- Playwright (Módulo 2) e SQLite/better-sqlite3 (Módulo 3) entram nas próximas fases.

## Como rodar

```bash
pnpm install
pnpm dev           # frontend Next.js (localhost:3000) — dados mock, sem credencial
pnpm test          # suíte do core (mocks, sem rede/credencial)
pnpm typecheck     # tsc --noEmit (core + frontend)
pnpm demo          # dry-run do Módulo 1 no terminal, com dados de exemplo
pnpm cli           # run REAL do Módulo 1 no terminal (precisa de .env com credenciais Google)
pnpm modelo        # gera docs/Protocolo-modelo.xlsx para o escritório preencher
pnpm build         # build de produção do Next.js
```

## Arquitetura (Ports & Adapters)

O Módulo 1 depende só de **interfaces** (`DriveGateway`, `SheetsGateway`). Adapters reais usam a
Google API; testes e `pnpm demo` usam adapters **em memória**. Por isso a suíte roda sem
credenciais. Nunca faça o domínio (`src/domain/*`) importar integração ou config concreta — a
dependência é sempre domínio <- config/integração.

```
config/default.ts          Config + mapeamento de colunas + TODOs de negócio
src/domain/                 Tipos + regras puras (sem I/O) — 100% testável isolado
  texto.ts                  Normalização (acento, caixa, dígitos)
  motivos.ts                MotivoRevisao (fonte única p/ relatório + diagnóstico)
  types.ts                  Cliente, Integrante, GrupoFamiliar, Resultado...
  parsePlanilha.ts          string[][] -> objetos, via mapeamento configurável
  grupoFamiliar.ts          agrupar + validar grupo familiar (tamanho variável)
  validacaoDocs.ts          presença dos 5 docs + limite de tamanho
  validacaoCliente.ts       campos obrigatórios do requerente
  associacao.ts             casa pasta do Drive <-> linha da planilha
src/integrations/           Ports + adapters (Google real / InMemory) + auth
src/modulo1/lerDados.ts     Orquestra o Módulo 1
src/relatorio/imprimir.ts   Print legível do resultado
src/index.ts                Entry real do CLI  (pnpm cli)
examples/                   demoData.ts + dryRun.ts  (pnpm demo)
tests/                      vitest (só mocks)
docs/                       schema da planilha + checklists de refinamento
```

## Frontend (Next.js — mesmo repo, `pnpm dev`)

App web local (Next.js 15 App Router + React 19 + Tailwind 3.4). Separação frontend/backend por
**diretório**, não por pacote. **O frontend é funcional**: todo botão executa uma Server Action que
altera estado real no servidor, persistido em `.data/estado.json` (sobrevive a reload e restart).

**Origem dos dados:** o store roda o Módulo 1 de verdade. Se houver `RPA_GOOGLE_KEY_FILE` +
`RPA_PASTA_RAIZ_ID` + `RPA_SPREADSHEET_ID` no `.env`, lê o **Google real** (adapters carregados por
import dinâmico); senão cai no dataset de exemplo. O Painel mostra qual origem está ativa.

**O que ainda é simulado:** só o preenchimento no Gerid. O job de execução é real (roda no servidor,
progresso por polling, grava no histórico), mas cada caso é marcado como sucesso sem tocar no Gerid —
as execuções ficam com `simulado: true`. Trocar isso é o Módulo 2 (Playwright).

```
app/                        Telas (App Router) + rotas de API
  painel, clientes, clientes/[cpf], execucao, revisao, relatorios, configuracoes
  api/resultado             GET (leitura atual) · POST (força reler o Drive/planilha)
  api/config                GET · PUT (persiste overrides)
  api/executar              POST (inicia o job)
  api/execucao/atual        GET (progresso — consumido por polling pela tela)
  api/execucoes             GET (histórico)
  api/revisao               GET · POST (registrar ação) · DELETE (desfazer)
  api/comprovantes/[id]     GET (baixa o comprovante consolidado da execução)
components/ui               Primitivos (Card, Badge, Botao, Tabela, Icone, StatCard...)
components/layout           AppShell, Sidebar, Header, ThemeToggle
components/dominio          ResumoCards, ClienteLista, GrupoFamiliarTabela, DocumentosChecklist,
                            MotivoBadge, ExecucaoProgresso, FilaRevisao, ConfiguracoesForm,
                            BotaoRecarregar
lib/server/store.ts         ESTADO DO SERVIDOR: config, execuções, ações; persiste em .data/estado.json
lib/server/actions.ts       Server Actions ('use server') que os botões chamam
lib/server/seed.ts          Histórico inicial de exemplo (só na 1ª criação do estado)
lib/data.ts                 Leitura server-side para os Server Components (usa o store)
lib/{types,format,motivos,cn}.ts   Tipos de UI, formatação, mapa motivo->ação, utils
styles/globals.css          Tailwind + fonte de sistema (offline-safe, sem next/font)
```

Regras de ouro do frontend:
- **Leitura** passa por `lib/data.ts`; **escrita** passa por `lib/server/actions.ts`. Nenhum
  componente fala com o store direto.
- `lib/server/store.ts` usa `node:fs` — **nunca** importe de um Client Component. Tipos
  compartilhados moram em `lib/types.ts` (client-safe).
- Páginas que leem estado mutável usam `export const dynamic = 'force-dynamic'`.
- As gravações do estado são **serializadas e atômicas** (grava `.tmp` + rename); `getExecucaoAtual`
  devolve **snapshot** (`structuredClone`), porque o job muta o objeto interno enquanto roda.

## Grupo familiar variável (REGRA CRÍTICA)

O grupo familiar **não é fixo**: pode ser só o requerente (mora sozinho), requerente+mãe,
requerente+mãe+pai+irmão, etc. Modelado como **lista de tamanho variável**, nunca como
"requerente + mãe" fixos.

Planilha em **2 abas relacionais**, ligadas pelo **CPF do requerente**:
- `Clientes`: 1 linha por requerente (`pasta, cpf, nome, cidade, cep, telefone`).
- `GrupoFamiliar`: 1 linha por integrante — **incluindo o próprio requerente** (`cpf_requerente,
  nome, parentesco, cpf, estado_civil, data_nascimento, renda`). O requerente tem
  `parentesco = "Titular"`.

`agruparGrupoFamiliar()` junta todas as linhas com o mesmo `cpf_requerente`. Invariantes
(`validarGrupoFamiliar`): existe ≥1 integrante; exatamente 1 Titular; CPF do Titular == CPF do
cliente; sem CPF duplicado. Detalhes e exemplos em `docs/schema-planilha.md`.

## Convenções de código

- Nomes de domínio em português (é a língua do negócio); tipos/estruturas idem.
- Comparação de texto sempre via helpers de `texto.ts` (nunca `===` cru em nome de arquivo/pasta/cabeçalho).
- Toda razão de "cair em revisão" é um `MotivoRevisao` **tipado** (nunca string solta) — é o que o
  relatório e o diagnóstico consomem.
- Sem `any` em código de domínio. `strict` + `noUncheckedIndexedAccess` ligados.
- Nada de segredo no repo: credenciais só via `.env` / `secrets/` (git-ignored).

## Decisões técnicas tomadas

- Schema desenhado do zero (cliente confirmou), com **mapeamento de colunas configurável**
  (`config.mapeamentoClientes` / `mapeamentoGrupoFamiliar`) para casar com a planilha real sem mexer no código.
- Grupo familiar em 2 abas relacionais (cliente confirmou), requerente incluído como "Titular".
- Validação de documento por **matcher de nome de arquivo** (frágil de propósito e configurável) —
  ver checklist. Tamanho conferido só nos arquivos que casam um doc obrigatório.
- Adapters em memória vivem em `src/integrations/**/inMemory*.ts` (não em `tests/`) porque são usados
  também pelo `pnpm demo`.

## Regras de negócio confirmadas pelo cliente (áudios de 2026-07-20)

- **Documentos: 4 obrigatórios + 2 facultativos.** Obrigatórios: Termo de representação,
  Procuração, Documentos pessoais, OAB. Facultativos: Documentos médicos, Cadastro único
  (o escritório sempre anexa, mas o Gerid não exige). Facultativo ausente **não bloqueia**.
- **Limite de 5 MB por arquivo** no Gerid. (O laudo médico do caso real tem 5,6 MB → estoura.)
- **Planilha: carta branca.** "pode alterar essa planilha e colocar do jeito que achar melhor" —
  por isso criamos a aba `GrupoFamiliar` e a coluna `CEP`.
- **Agência é escolhida pelo CEP** (a planilha só tinha cidade).
- **Documentação do grupo familiar vai num arquivo só**, junto com os documentos pessoais.
- **Comprovante** salvo na pasta do cliente com o nome `comprovante protocolo`; depois a pasta do
  cliente é movida para `Protocolado/` (ambos configuráveis em `posProtocolo`).
- **Volume: ~5 protocolos/dia** (corrigido pelo cliente em 2026-08-13; o briefing de julho
  dizia 10–14/dia com meta de ~50/dia, e isso está errado). O número não é decorativo:
  foi ele que fixou a ronda contínua da extensão em 5 minutos. Intervalo mais curto seria
  bater no GERID dezenas de vezes por hora sem achar nada — a insistência que acorda o
  antiabuso da Dataprev. E descarta volume como causa quando um bloqueio aparece.
- **A pasta atual é ambiente de TESTE**, não a base real do escritório. O caso do Antônio já foi
  protocolado de verdade — não reprotocolar.
- **Service account:** o cliente não tem o JSON da conta existente; criamos uma nova
  (ver `docs/service-account.md`).

## Realidade do Drive do cliente (inspecionado em 2026-07-20)

⚠️ O que existe de verdade **diverge do briefing** — não modele por suposição.

**Pasta raiz "Protocolo INSS"** — id em `RPA_PASTA_RAIZ_ID` no `.env` (não versionado).
Conteúdo: 1 pasta por cliente (nome completo em CAIXA ALTA) + `Protocolado/` (destino de quem
já foi protocolado) + `Protocolo.xlsx` + `OAB.pdf`.

**Documentos por cliente: são 6, e os nomes NÃO batem com o briefing.**
`Termo de representação.pdf` · `Procuração.pdf` · `Cadastro único.pdf` ·
`Documentos médicos.pdf` · `Documentos pessoais.pdf` · `OAB.pdf`
- Não existe "Cadastro de Biometria" — o que existe é **Cadastro único** (CadÚnico).
- "Documentos pessoais" é a identificação do interessado (RG/CPF).
- `Procuração` é um documento à parte do `Termo de representação`.
- `OAB.pdf` fica na raiz **e** copiado em cada cliente (é o mesmo para todos).

**Planilha `Protocolo.xlsx`** — id em `RPA_SPREADSHEET_ID` no `.env` (não versionado).
- É **.xlsx**, não Google Sheets nativo → **a Sheets API não lê**. Precisa baixar/exportar via
  Drive API e parsear.
- Aba única `Planilha1`. Colunas: `Nome | CPF | Cidade do protocolo | Estado civil`.
- **Não há NENHUMA coluna de grupo familiar** — a regra crítica do projeto não tem representação
  na planilha atual. Origem do dado ainda **não definida** (aguardando o cliente).
- Não há CEP (só cidade), telefone nem coluna "pasta" — a pasta é o próprio Nome.
- CPF sem máscara e aparentemente numérico → **CPF pode começar com zero** (é o caso do próprio
  procurador). Tratar sempre como **texto**.

**Segurança/LGPD:** a pasta está como "qualquer pessoa na internet com o link pode editar", com
CPFs e laudos médicos de PCD. Sinalizado ao cliente; correção é decisão dele.

⚠️ **Nunca versionar dado real.** IDs de pasta/planilha, CPFs, nomes de requerentes e e-mails ficam
só no `.env` (git-ignored). Exemplos em código/teste/doc usam dados FICTÍCIOS. Como a pasta do Drive
é acessível por link, publicar o ID equivale a publicar o acesso.

**Service Account** `organizador-drive@organizador-documental.iam.gserviceaccount.com` **já tem
acesso** à pasta — falta apenas o JSON da chave.

## TODOs de negócio

- [ ] **Campos exatos por integrante** que o Gerid pede (só nome+CPF? parentesco? renda?).
      **Bloqueia o Módulo 2** — só dá para saber vendo a tela do Gerid. Pedir print ao cliente.
- [ ] ⏰ **Sincronizar o relógio do Windows** — o serviço `w32time` está parado e o PC ficou 8 min
      adiantado, o que faz o Google recusar a credencial (`invalid_grant`). Precisa de admin.
      Ver `docs/service-account.md` → "Relógio fora de sincronia".
- [ ] **Compartilhar a pasta "Protocolo INSS"** com `rpa-gerid-drive@rpa-gerid.iam.gserviceaccount.com`
      (se ainda falhar depois de acertar o relógio).
- [x] ~~Criar a service account~~ — projeto `rpa-gerid`, conta `rpa-gerid-drive@...`,
      chave em `secrets/service-account.json`.
- [ ] **Entregar `docs/Protocolo-modelo.xlsx`** ao Fabrício e pedir que preencha o grupo familiar.
- [ ] **Confirmar** se "Documentos médicos" é mesmo facultativo — é contraintuitivo num pedido de
      BPC por deficiência (pode ser que a perícia seja agendada depois).
- [x] ~~Dados fixos do escritório~~ — no `.env` (`RPA_TELEFONE_PADRAO`, `RPA_PROCURADOR_*`).
- [x] ~~Limite de tamanho~~ — 5 MB, confirmado.
- [x] ~~Origem do grupo familiar~~ — nova aba na planilha (cliente autorizou redesenhar).
- [x] ~~Seleção de agência~~ — pelo CEP.
- [x] ~~Matchers de documento~~ — ajustados aos nomes reais.
- [x] ~~Leitor de .xlsx~~ — `XlsxSheetsGateway` via Drive API.

## Cadastro pelo sistema (alimenta a planilha)

O operador cadastra/edita clientes pelo app e o sistema **grava na planilha do
Drive** — não precisa abrir o Excel.

- Telas: `/clientes/novo` e `/clientes/[cpf]/editar` (`components/dominio/ClienteForm.tsx`).
  O grupo familiar é uma lista dinâmica: "+ Adicionar integrante" / remover.
- Validação antes de gravar: `src/domain/validacaoCadastro.ts` (exatamente 1 Titular,
  CPF do Titular == CPF do requerente, sem CPF repetido, CEP obrigatório).
- Escrita: `serializarPlanilha.ts` (domínio -> linhas) + `XlsxSheetsGateway.escreverAbas`
  (regrava as abas e sobe o .xlsx via Drive API).
- **CPF é gravado como TEXTO** (`numFmt = '@'`), senão o zero à esquerda se perde.
- **Backup automático em disco** (`backups/`) antes da primeira gravação.
  Desfazer com `pnpm restaurar`.

⚠️ Escopo do Google mudou para `auth/drive` (leitura + escrita). A service account
precisa de permissão de **Editor** na planilha.

⚠️ **Service account não tem cota de armazenamento** — pode ALTERAR arquivo existente,
mas não CRIAR nem COPIAR. Ver `docs/serviceaccount-cota.md` (afeta o Módulo 3).

## Regra inegociável: nada de dado simulado

O sistema **nunca finge**. Um protocolo errado no INSS tem custo real para uma
pessoa com deficiência, então:

- Um caso só vira **sucesso** quando o Gerid devolve o número do protocolo.
- Qualquer outra coisa vira **erro com motivo** (coberto por teste).
- Nenhum caso pode terminar `pendente`/`processando` — quem sobrou vira erro.
- O histórico de execuções começa **vazio**; só recebe execução real.
- Se a leitura do Google falhar, o Painel mostra a causa em vermelho em vez de
  passar dado de exemplo como se fosse real.
- Sem cliente pronto, a execução **se recusa a iniciar**.

## Módulo 2 — robô do Gerid (`src/modulo2/`)

- `roboGerid.ts` — **real**: abre o Chrome com perfil persistente (herda a sessão
  que o operador autenticou), navega, detecta sessão expirada e verificação de
  segurança, tira screenshot na falha.
- `tiposGerid.ts` — contrato do robô + motivos de falha tipados.
- `mapaGerid.ts` — **o único ponto que exige acesso ao Gerid real**. Enquanto
  `pendencias` não estiver vazio, `mapeamentoCompleto()` é false e o robô
  **se recusa a protocolar** (`MAPEAMENTO_PENDENTE`).

⚠️ **Não preencha `mapaGerid.ts` no chute.** Seletor inventado faria o robô
protocolar dado errado em nome de terceiros. Siga
`docs/checklists/revisao-seletor-playwright.md` com o Gerid aberto.

## Módulo 3 — comprovante (`src/modulo3/comprovante.ts`)

Tenta salvar na pasta do cliente no Drive; se a credencial não puder criar
arquivo, salva em disco local e **devolve um aviso explícito** com a causa.
Ver `docs/serviceaccount-cota.md`.

## Status

- **Autenticação Google: FUNCIONANDO** (testada em 2026-07-22 contra o Drive real).
  `pnpm auth:test` (leitura) e `pnpm escrita:test` (escrita).
- **Cadastro pelo sistema: FUNCIONANDO** — cliente + grupo familiar gravam na planilha real.
- **Módulo 1 (leitura de dados): implementado e testado.** Roda isolado, sem Gerid nem Google real.
- **Frontend: implementado e FUNCIONAL.** Todas as ações fazem algo de verdade e persistem:
  recarregar dados, salvar config, marcar/desfazer na fila de revisão, disparar execução
  (job no servidor + polling) e baixar comprovante. Estado sobrevive a restart.
- **Deploy: no ar** em `rpa-gerid-production.up.railway.app` (Railway, auto-deploy no push).
- **Módulo 2 (Playwright): infraestrutura pronta, mapeamento pendente.** Navegador, sessão,
  erros e screenshots funcionam. Falta preencher `src/modulo2/mapaGerid.ts` com as telas reais
  do Gerid — exige acesso ao sistema (print da etapa do grupo familiar).
- **Módulo 3 (comprovante): implementado**, com fallback para disco local enquanto a credencial
  não puder criar arquivo no Drive.
- **Zero simulação:** 70 testes verdes, typecheck limpo, build de produção OK.

### O que ainda bloqueia o uso em produção

1. **Mapeamento do Gerid** (`mapaGerid.ts`) — sem isso o robô não protocola, por decisão de projeto.
2. **`RPA_GOOGLE_CREDENTIALS` no Railway** — sem ela o servidor roda com dataset de exemplo.
3. **Cota da service account** — impede salvar o comprovante no Drive (cai para local).
