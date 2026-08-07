# Mapeamento REAL do GERID — capturado do DOM

> Sessão de 28/07/2026, com o Fabrício ao vivo (AnyDesk na máquina dele).
> **Nada aqui foi inferido de print.** Tudo saiu do DOM da aplicação em produção,
> extraído via console do DevTools.
>
> Este documento substitui as suposições de `src/modulo2/preencherGerid.ts` e é a
> fonte da verdade para preencher `src/modulo2/mapaGerid.ts`.

## URL real

```
https://atendimento.inss.gov.br/tarefas        <- lista de tarefas (entrada)
https://atendimento.inss.gov.br/requerimentos  <- wizard (SPA, mesma URL nos 11 passos)
```

⚠️ O código usa `https://gerid.dataprev.gov.br` como padrão e o
`docs/gerid-fluxo-real.md` cita `novorequerimento.inss.gov.br`. **Ambos errados.**

## As 11 etapas (confirmadas na barra do wizard)

`Selecionar Serviço · Informar Requerente · Autorização CadÚnico · Grupo Familiar ·
Comprometimento de Renda · Proteção Especial SUAS · Dados Requerente ·
Selecionar Unidade · Órgão Pagador · Confirmar · Comprovante`

Antes de escolher o serviço a barra mostra só 6 etapas genéricas. Ela se expande
para 11 depois que o BPC PcD é selecionado.

---

## Armadilhas estruturais (valem para todos os passos)

Estas são a razão pela qual o preenchimento atual quebraria já na primeira execução.

### 1. É uma SPA e o DOM nunca é limpo

O conteúdo de todas as etapas já visitadas **permanece no HTML**, apenas oculto.
No passo 3 existiam 3 pares de "Voltar/Avançar" simultâneos; no passo 7, mais ainda.

- `getByRole('button', { name: /Avançar/i }).click()` → **erro de strict mode**
  ("resolved to N elements").
- `getByText(...).first()` pode casar num nó de tela anterior.
- `esperarTela()` não pode se basear só na presença do texto: "Seleção de Serviços"
  e "Atenção" continuam no DOM em todas as etapas, invisíveis.

**Regra:** todo seletor exige visibilidade, ou é ancorado em ID estável.

### 2. IDs duplicados entre componentes

O mesmo `id` aparece em contextos diferentes com significados opostos:

| id do radio | no dropdown de Estado Civil | no dropdown de Parentesco |
|---|---|---|
| `1` | Solteiro | Cônjuge |
| `2` | Casado | Filho(a) |
| `3` | Viúvo | Pai / Mãe / Padrasto / Madrasta |
| `4` | Divorciado | Irmão / Irmã |
| `6` | União Estável | Companheiro (a) |

Os 11 `input[type=file]` também compartilham `id="single-file"`.

**Regra:** nunca `document.querySelector('#4')`. Sempre escopar no container do
componente (`{idDoCombobox}-itens`) ou na caixa do slot.

### 3. Os "selects" não são `<select>`

São comboboxes customizados: `<input type="text" role="combobox">` com um container
irmão `{id}-itens` que guarda as opções como `<input type="radio">`.

**`page.selectOption()` não funciona.** É preciso clicar no combobox e depois clicar
no radio da opção, dentro do container correto.

### 4. IDs viram hash no passo 7

No passo 7 os dropdowns têm id `ca-<md5>` (ex.: `ca-e26ea5d1c5f6782e1cbf12b929583584`).
Provavelmente é hash do texto da pergunta — possivelmente estável, mas não confiável.

**Regra:** localizar pelo texto da pergunta visível, e só então usar o `-itens` dele.

### 5. Rótulos com espaço no fim

`"C) Não "`, `"B) Sim, de outro órgão "`, `"Não há recebimento de Bolsa Família "`
têm espaço final, tanto no id quanto no texto. Comparação exata quebra.

**Regra:** `trim()` antes de comparar, sempre.

---

## Passo 1 — Selecionar Serviço

```
input[id="idSelecionarServico"]        campo de busca, placeholder "Selecione um Serviço"
#idSelecionarServico-itens             container das 66 opções (radios)
  input[id="1655"]  → Benefício Assistencial à Pessoa com Deficiência   ← ALVO
  input[id="1657"]  → Benefício Assistencial ao Idoso
  input[id="3099"]  → Suspender o BPC PcD para Inclusão no Mercado de Trabalho
  input[id="18536"] → Agendamento - Guichê Virtual - OAB (presencial)
```

O código atual tenta digitar `"BENEFICIO ASSIS"` num combobox. Desnecessário: o
serviço tem **código numérico fixo do INSS**, muito mais estável.

## Passo 2 — Informar Requerente

```
input[id="idRequerente.cpf"]     "CPF *"               ph "Informe o CPF do requerente"
input[id="nascimentoRequerente"] "Data de Nascimento"  ph "__/__/____"
input[id="nomeRequerente"]       "Nome"                ph "Nome do Requerente"
```

- ⚠️ O id **tem um ponto**: `#idRequerente.cpf` em CSS é lido como id + classe.
  Usar `input[id="idRequerente.cpf"]`.
- **Só o CPF é obrigatório** (único com `*`).
- **O nome preenche sozinho ao digitar o CPF** — não há lupa nem Enter.
  O `press('Enter')` do código atual é desnecessário. *(Resolve item marcado VALIDAR.)*

## Passo 3 — Autorização de Uso de Dados e Confirmação de Renda

```
input[id="campo-autorizacaoCadunico"]  (checkbox)
name="checkbox-autorizacaoCadunico"
```

Texto: "Autorizo o uso dos dados do CadÚnico sobre o grupo e renda familiar e
declaro que as informações estão corretas e atualizadas."

## Passo 4 — Grupo Familiar

**A tela que travava o projeto.** IDs indexados e determinísticos:

```
selectEstadoCivil0     ← linha 0 = REQUERENTE (só estado civil)
selectParentesco1      ← linha 1 = familiar
selectEstadoCivil1
...
selectParentesco{i} / selectEstadoCivil{i}
```

🔴 **Não existe `selectParentesco0`.** O parentesco do requerente já vem fixo.

Isto confirma um bug real: `passo4GrupoFamiliar` assume "parentesco = `nth(0)`,
estado civil = `nth(qtdSelects-1)`". Na linha do requerente há **um controle só**,
então os dois índices apontam para o mesmo elemento — o estado civil seria escrito
e sobrescrito pelo parentesco, sem gerar aviso.

### Opções de Parentesco (container `selectParentesco{i}-itens`)

| id | rótulo |
|---|---|
| `1` | Cônjuge |
| `2` | Filho(a) |
| `3` | Pai / Mãe / Padrasto / Madrasta |
| `4` | Irmão / Irmã |
| `6` | Companheiro (a) |
| `8` | Enteado |
| `9` | Menor Tutelado |
| `17` | Outros |

**Não existe Avô/Avó.**

### Opções de Estado Civil (container `selectEstadoCivil{i}-itens`)

| id | rótulo |
|---|---|
| `1` | Solteiro |
| `2` | Casado |
| `3` | Viúvo |
| `4` | Divorciado |
| `5` | Separado |
| `6` | União Estável |

### Pergunta final

"Há alguém do grupo familiar que você queira incluir ou excluir?"

```
input[id="undefined-Nao"]  (checkbox)  "Não"   ← resposta padrão
input[id="undefined-Sim"]  (checkbox)  "Sim"
```

⚠️ São **checkboxes**, não botões. `responderNaoSim()` procura `getByRole('button')`
e falharia. E o prefixo `undefined-` é bug de template do INSS — pode sumir se
corrigirem; usar id com fallback por rótulo.

## Passos 5 e 6

Comprometimento de Renda e Proteção Especial SUAS. Resposta sempre **Não**.
IDs dos controles ainda não capturados (provável mesmo padrão de checkbox).

## Passo 7 — Dados Requerente

### Contato

```
selectTipoContato-itens
  CELULAR      Celular
  EMAIL        E-mail
  COMERCIAL    Telefone comercial
  RESIDENCIAL  Telefone residencial
  WHATSAPP     Telefone WhatsAPP
```

### Dados adicionais (ids em hash)

Pergunta obtida do texto visível ao lado de cada combobox. `*` = obrigatório.

| id (hash) | pergunta | opções | resposta |
|---|---|---|---|
| `ca-e26ea5d1c5f6782e1cbf12b929583584` | \* Você é estrangeiro em situação regular no Brasil? | A) Sim · B) Não | `B) Não` |
| `ca-4d3bb39d52d2db0200c11a470922b675` | \* Deseja cadastrar Representante Legal para este pedido? | Sim · Não | `Não` |
| `ca-b919a5a7a80cd27270c910f5f0e3f99e` | \* Deseja cadastrar Procurador para este pedido? | Sim · Não | `Sim` |
| `ca-0207f1ea05d8163b3f601621926627b7` | \* Onde você mora? | Moro em residência · Instituição de Acolhimento · Situação de Rua · Instituição de Custódia · Instituição Carcerária ou Socioeducativa | `Moro em residência` |
| `ca-581ab9f66ee0e8c4c76d530bd83bdf69` | \* Recebe algum tipo de benefício? | A) Sim, do INSS · B) Sim, de outro órgão · C) Não | `C) Não ` |
| `ca-bb970af1cbeae87f716339ba4a7048b4` | *(rótulo não resolveu)* — Bolsa Família | Sim · Não · Não há recebimento de Bolsa Família · O titular do BPC ou o seu representante legal não é o responsável familiar no CadÚnico | **⚠️ ver abaixo** |
| `ca-5b91133a3c19376dcef6c41565dcb330` | \* Caso não possua os requisitos ao benefício na data de hoje, autoriza o INSS a alterar a data do pedido para atender às condições para o benefício? | Sim · Não | `Sim` |
| `ca-bed835ecc56530d8e16f80ab3cb3feb8` | Conhecido por/Apelido | *(texto livre)* | opcional |
| `ca-c1835a3e4e07b66270cd66c03f527f54` | \* Estou ciente de que devo acompanhar o pedido pelos canais de atendimento, pois pode ser necessário apresentar novos documentos ou informações, com prazo de entrega. | *(ciência)* | marcar |

Outros `ca-*` sem rótulo resolvido (prováveis componentes internos dos slots de
anexo): `7aa3dcb3`, `455a3a51`, `98f66605`, `3fa2eb9a`, `db967fe2`, `782e55ff`,
`f958079d`, `82741202`, `3b138871`, `fa5b4cf5`, `5186e37b`.

✅ Todas as `RESPOSTAS_FIXAS` do código agora estão amarradas a perguntas reais.

🔴 **Bolsa Família não é Sim/Não.** São 4 opções. O código responde `'Sim'` fixo
(desligamento voluntário). Se a família **não recebe** Bolsa Família, a resposta
correta é "Não há recebimento de Bolsa Família". Pendente de regra do escritório.

### 🔴 "Forma de Convívio" não existe nesta tela

Nenhum combobox do passo 7 tem as opções "Com pessoas da família" / "Sozinho", e
nenhum rótulo menciona convívio. O `docs/gerid-fluxo-real.md` (reconstruído de
prints) lista esse campo, mas ele **não aparece no DOM**.

Impacto: `FORMA_CONVIVIO` e `formaDeConvivio()` em `regrasPreenchimento.ts` são a
**única regra que variava por caso** — e podem ser código morto. O rótulo "Sozinho"
já estava marcado como não confirmado, e o teste que o trava (`toBe('Sozinho')`) dá
falsa sensação de validação.

Antes de remover: verificar se é campo condicional (aparece só em certos casos) ou
se mudou de versão do sistema.

Também não apareceu o checkbox "Comunicarei o óbito… em até 30 dias" citado nos prints.

### Anexos — 11 slots nomeados (ordem estável)

| # | slot no GERID | nosso tipo |
|---|---|---|
| 0 | Termo de representação da entidade conveniada **\*** | `TERMO_REPRESENTACAO` |
| 1 | Documento de identificação do procurador (OAB/RG/CNH/CTPS) | `OAB` |
| 2 | Comprovante da representação legal, se for o caso | `PROCURACAO` |
| 3 | Documentos de identificação do representante legal, se for o caso | — |
| 4 | Documentos de identificação do interessado **\*** | `DOCUMENTOS_PESSOAIS` |
| 5 | Documento de identificação de todos os membros do grupo familiar | `CADASTRO_UNICO` |
| 6 | Comprovantes das relações previdenciárias do interessado e do grupo familiar | — |
| 7 | Outros documentos | — |
| 8 | Documento Médico | `DOCUMENTOS_MEDICOS` |
| 9 | Comprovante do cadastro biométrico do titular | *(ver nota)* |
| 10 | Comprovante do cadastro biométrico do representante legal | — |

✅ **`SLOT_GERID_POR_TIPO` está correto** — os 6 tipos casam 1:1. Nenhuma correção.

- **Só 2 slots são obrigatórios** (0 e 4). Nossa regra exige 4 documentos — é mais
  restritiva que a do INSS, de propósito. Manter.
- ✅ **Confirma que "Documento Médico" é facultativo** no GERID.
  Fecha o TODO antigo do `CLAUDE.md`.
- Extensões aceitas: `.pdf .png .jpg .jpeg .bmp`. **Não aceita .doc/.docx.**
- `multiple=true` em todos os slots.
- Todos com `id="single-file"` → localizar pela caixa do slot, não pelo id.

## Passos 8, 9, 10 — capturados em 07/08/2026

### Passo 8 — Selecionar Unidade

- CEP: `input[placeholder="__.___-___"]` (o campo continua sem id).
- Buscar: botão com nome acessível `Buscar`.
- Cada agência é um card clicável `.unidade[tabindex="0"]`.
- O clique confirmado adiciona a classe `.selected` ao card.
- Nome e município ficam em `.nome` e `.municipio` dentro do card.
- A busca por CEP pode retornar apenas agências regionais, sem uma agência no
  município do cliente. Nesse caso o robô usa a primeira opção ordenada pelo
  próprio GERID e registra aviso para a revisão humana.

### Passo 9 — Órgão Pagador

- Município: combobox customizado `#orgaoPagadorMunicipio`.
- A cidade do cadastro pode vir como `CIDADE/UF`; o sufixo é removido antes de
  selecionar a opção do município.
- Após o filtro, os locais pagadores aparecem em `table tbody`.
- A seleção correta é o primeiro `input[type="radio"]` da tabela filtrada; a
  linha recebe a classe `.selecionada` e o radio fica marcado.
- O filtro de Bairro é opcional e não é necessário para avançar.

### Passo 10 — Confirmar

O resumo real exibe serviço, unidade de protocolo, requerente, órgão pagador e
anexos. A extensão para nessa tela. Ela não marca
`#campo-declaracaoConfirmar` e não clica em `Avançar`.

---

## Decisões do escritório — 28/07/2026

| tema | decisão |
|---|---|
| Parentesco sem opção no GERID (avô, tio, neto…) | marcar **Outros** (17). Não vira pendência. |
| Cônjuge / Companheiro(a) | sempre **Companheiro (a)** (6) |
| Estado civil | sempre **Solteiro** (1) — *aguardando confirmação, ver abaixo* |
| "Incluir ou excluir alguém do grupo?" | sempre **Não** |
| Comprometimento de Renda (passo 5) | sempre **Não** |
| Proteção Especial SUAS (passo 6) | sempre **Não** |

⚠️ **Estado civil fixo em "Solteiro" precisa de confirmação explícita.** A planilha
do escritório tem coluna "Estado civil" preenchida; fixar Solteiro descarta esse
dado, inclusive quando disser "Casado". É uma declaração ao INSS dentro do
requerimento — deve ser escolha consciente, não efeito colateral.

## Correções necessárias em `regrasPreenchimento.ts`

### `ESTADOS_CIVIS_GERID` — dois mapeamentos factualmente errados

```
'uniao estavel' → 'Casado'       ERRADO. Existe "União Estável" (6).
'separado'      → 'Divorciado'   ERRADO. Existe "Separado" (5).
```

O comentário no código diz "o GERID não distingue". **Distingue.**

*(Se a regra "sempre Solteiro" for confirmada, isto deixa de afetar o
preenchimento — mas fica registrado caso a decisão mude.)*

### `GRUPOS_PARENTESCO_GERID` — 3 de 5 errados

| no código | realidade |
|---|---|
| `Pai / Mãe / Padrasto / Madrasta` | ✅ correto |
| `Irmão / Irmã` | ✅ correto |
| `Cônjuge / Companheiro(a)` | ❌ são **duas** opções separadas |
| `Filho / Filha / Enteado(a)` | ❌ são **duas** opções separadas |
| `Avô / Avó` | ❌ **não existe** no GERID |

Faltam também `Menor Tutelado` (9) e `Outros` (17).

### `mapearParentesco()` — muda o contrato

Hoje devolve `{grupo: null}` para parentesco desconhecido, e o caso vira pendência.
Por decisão do escritório o fallback passa a ser **Outros (17)**. Manter aviso no
log para o advogado conferir na tela de Confirmar.

## Pendências abertas

- [ ] Confirmar "estado civil sempre Solteiro" com o Fabrício
- [ ] Regra do Bolsa Família (4 opções, não 2)
- [x] ~~Identificar os 3 dropdowns `[Sim, Não]` do passo 7~~ — feito
- [ ] "Forma de Convívio" existe mesmo? Não apareceu no DOM. Se não existir,
      remover `FORMA_CONVIVIO`, `formaDeConvivio()` e os 2 testes que a travam
- [ ] Capturar passos 5, 6, 8, 9, 10
- [ ] Data de Nascimento do requerente: obrigatória? A planilha não tem essa coluna
- [ ] Nos prints de 23/07 o "TÍTULO ELEITORAL.pdf" foi anexado no slot 9
      (cadastro biométrico do titular) — contorno intencional do gate de biometria?
      O robô deve reproduzir?
