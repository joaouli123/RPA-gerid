# Schema da planilha "Protocolo"

> Modelo pronto para o escritório preencher: **[Protocolo-modelo.xlsx](./Protocolo-modelo.xlsx)**
> (regenerar com `pnpm modelo`).

## Situação atual x proposta

A planilha real hoje (`Protocolo.xlsx`, conferida em 2026-07-20) tem **uma aba** (`Planilha1`) e
**quatro colunas**: `Nome | CPF | Cidade do protocolo | Estado civil`. Não há nada sobre grupo
familiar nem CEP.

O Fabrício autorizou redesenhar ("pode alterar essa planilha e colocar do jeito que achar melhor,
que ficar mais fácil para o sistema" — áudio de 2026-07-20). A proposta abaixo acrescenta o **CEP**
(que ele pediu para localizar a agência) e a aba **GrupoFamiliar**.

⚠️ **A planilha é `.xlsx`, não Google Sheets nativo.** A Sheets API não lê esse formato — o robô
baixa o arquivo pela Drive API e parseia (`src/integrations/sheets/xlsxSheets.ts`).

## Aba `Clientes` — 1 linha por requerente

| coluna                | obrigatório | descrição                                                     |
|-----------------------|-------------|---------------------------------------------------------------|
| `Nome`                | sim         | Nome completo. Precisa ser **igual ao nome da pasta** no Drive. |
| `CPF`                 | sim         | Só números. **Formatar a coluna como TEXTO** (ver abaixo).     |
| `CEP`                 | sim         | Usado para localizar a agência do INSS mais próxima.           |
| `Cidade do protocolo` | sim         | Cidade onde o requerimento será protocolado.                   |
| `Estado civil`        | sim         | solteiro, casado, viúvo…                                      |
| `Telefone`            | não         | Em branco usa o telefone padrão do escritório.                 |

Não existe coluna `Pasta`: quando ela falta, o robô usa o **Nome** como nome da pasta — que é como
o escritório organiza hoje. Se um dia a pasta divergir do nome, basta acrescentar a coluna `Pasta`.

### 🔴 CPF precisa ser TEXTO

Se a coluna ficar como número, o CPF que começa com zero **perde o dígito**:
`09876543210` (CPF do próprio procurador) vira `9876543210` e fica inválido.

O modelo já vem com a coluna formatada como texto. Como reforço, o robô também recompõe o zero
automaticamente (`padronizarCpf`), mas o certo é a planilha guardar como texto.

## Aba `GrupoFamiliar` — 1 linha por integrante (inclui o requerente)

| coluna            | obrigatório | descrição                                                    |
|-------------------|-------------|---------------------------------------------------------------|
| `cpf_requerente`  | sim         | CPF do requerente — **chave** que liga o integrante ao cliente. |
| `nome`            | sim         | Nome do integrante.                                          |
| `parentesco`      | sim         | `Titular` para o próprio requerente; senão `Mãe`, `Pai`, `Irmão(ã)`, `Cônjuge`, `Filho(a)`, `Outro`. |
| `cpf`             | não         | CPF do integrante.                                          |
| `estado_civil`    | não         | Estado civil.                                               |
| `data_nascimento` | não         | Formato `AAAA-MM-DD`.                                       |
| `renda`           | não         | Renda declarada (0 se não tiver).                           |

Colunas extras viram `camposAdicionais` — é aí que entram os campos por-integrante que o Gerid
pedir e que ainda não confirmamos.

### Como o tamanho variável funciona

Cada requerente acumula **quantas linhas tiver**:

```
cpf_requerente | nome                | parentesco
11122233344    | ANTÔNIO CARLOS ...  | Titular      <- mora sozinho: 1 integrante

52998224725    | MARIA SOUZA ...     | Titular      <- Maria + mãe: 2 integrantes
52998224725    | RITA SOUZA          | Mãe

39053344705    | PEDRO LIMA          | Titular      <- + mãe + pai + irmão: 4 integrantes
39053344705    | JOANA LIMA          | Mãe
39053344705    | JOSÉ LIMA           | Pai
39053344705    | PAULO LIMA          | Irmão
```

### Invariantes validadas (`validarGrupoFamiliar`)

- Existe pelo menos 1 integrante (senão `GRUPO_FAMILIAR_AUSENTE`).
- Exatamente 1 `Titular` no grupo.
- CPF do `Titular` (quando informado) == CPF do cliente.
- Sem CPF duplicado entre integrantes.

## Nomes de coluna são tolerantes

Cada campo aceita **vários rótulos** (`config/default.ts` → `mapeamentoClientes` /
`mapeamentoGrupoFamiliar`). Por exemplo, `cidade` casa tanto `Cidade do protocolo` quanto `Cidade`.
Caixa, acento e `_`/espaço são normalizados. Para aceitar um rótulo novo, basta acrescentá-lo à
lista — sem tocar em código de lógica.

## Documentos na pasta do cliente

Confirmado com o cliente em 2026-07-20:

| documento                  | obrigatório | observação                                   |
|----------------------------|-------------|----------------------------------------------|
| Termo de representação     | **sim**     |                                              |
| Procuração                 | **sim**     | documento separado do termo                  |
| Documentos pessoais        | **sim**     | RG/CPF do interessado                        |
| OAB                        | **sim**     | mesmo arquivo para todos; fica na raiz e/ou por cliente |
| Documentos médicos         | não         | facultativo no Gerid, mas o escritório sempre anexa |
| Cadastro único (CadÚnico)  | não         | idem                                         |

**Limite de 5 MB por arquivo** (informado pelo Gerid). Documento facultativo ausente **não bloqueia**
o protocolo — aparece só no checklist da tela.

Quando o grupo familiar tem mais gente, a documentação da família entra **num arquivo só**, junto
com os documentos pessoais.
