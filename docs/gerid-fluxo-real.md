# Fluxo real do GERID — Benefício Assistencial à Pessoa com Deficiência

Reconstruído a partir de 28 prints do Fabrício logado (23/07/2026). Portal:
`novorequerimento.inss.gov.br` (login CAS em `geridinss.dataprev.gov.br`),
perfil **ENTIDADE_CONVENIADA_OAB** (advogado como procurador).

> ⚠️ Este documento é a fonte da verdade para o Módulo 2. Nenhum seletor foi
> inventado — tudo veio das telas reais. O que ainda não dá para afirmar está
> marcado como **DECISÃO** (precisa do Fabrício) ou **VERIFICAR**.

## As telas (11 passos)

O requerimento é um assistente de **11 passos**, não 6:

1. **Selecionar Serviço** — combobox "Serviço"; digitar/escolher
   "Benefício Assistencial à Pessoa com Deficiência". Botão **Avançar**.
2. **Informar Requerente** — campo **CPF** (com lupa de busca) + **Data de
   Nascimento**; ao buscar o CPF, o **Nome** é preenchido sozinho (mascarado,
   somente leitura). Avançar.
3. **Autorização CadÚnico** — 1 checkbox: "Autorizo o uso dos dados do CadÚnico
   sobre o grupo e renda familiar e declaro que as informações estão corretas".
   Marcar. Avançar.
4. **Grupo Familiar** — ver seção "Descoberta principal" abaixo.
5. **Comprometimento de Renda** — pergunta Não/Sim sobre gastos com a
   deficiência negados pelo Poder Público. **DECISÃO** (padrão observado: Não).
6. **Proteção Especial SUAS** — pergunta Não/Sim sobre Serviço de Proteção
   Especial (Centro-Dia) negado. **DECISÃO** (padrão observado: Não).
7. **Dados Requerente** — a tela mais cheia:
   - **Contatos** (modal "Adicionar"): Tipo (Celular / E-mail) + Valor →
     Adicionar → Fechar. No exemplo: Celular `(62) 9935-3363` e E-mail
     `inssclientefd@gmail.com`.
   - "Você aceita acompanhar o andamento pelo Meu INSS / 135 / e-mail?" → **Sim**.
   - **Dados Adicionais** (selects obrigatórios):
     - Você é estrangeiro em situação regular no Brasil? → "B) Não"
     - Deseja cadastrar Representante Legal? → "Não"
     - Deseja cadastrar Procurador? → "Sim" (fixo, porque loga como OAB)
     - checkbox "Comunicarei o óbito... em até 30 dias" → marcar
     - **CPF do Procurador** → CPF do Fabrício (`047.947.501-61`)
     - Onde você mora? → "Moro em residência"
     - Forma de Convívio → "Com pessoas da família"
     - Recebe algum tipo de benefício? → "C) Não"
     - Bolsa Família / desligamento voluntário → "Sim"
     - Autoriza o INSS a alterar a data do pedido? → "Sim"
     - Conhecido por/Apelido → (livre, opcional)
     - checkbox "Estou ciente de que devo acompanhar..." → marcar
   - **Anexos** — slots NOMEADOS (ver seção Documentos). 5 MB/arquivo, 50 MB total.
8. **Selecionar Unidade** — abas "Consultar por CEP" / "por Município". Digitar
   **CEP** → Buscar → escolher a unidade na lista. Avançar.
9. **Órgão Pagador** — Município + Bairro (selects) → lista de agências (radio) →
   escolher onde receber o benefício. Avançar.
10. **Confirmar** — tela de revisão de tudo + declaração legal + checkbox
    "Declaro que li e concordo com as informações acima". Avançar.
11. **Comprovante** — lista os documentos, agendamentos (Avaliação Social /
    Perícia) e os botões **Gerar Comprovante** / **Cancelar Requerimento**.

## Descoberta principal — Grupo Familiar (passo 4)

**O GERID já traz o grupo familiar pronto, puxado do CadÚnico.** A tela lista as
pessoas com CPF e Nome (somente leitura). O que se preenche por integrante é:

- **Grau de Parentesco** (select) — exceto o requerente, que já vem como
  "Requerente" fixo. Opções são AGRUPADAS, ex.: "Irmão / Irmã",
  "Pai / Mãe / Padrasto / Madrasta".
- **Estado Civil** (select) — ex.: "Solteiro".

E no fim: "Há alguém do grupo familiar que você queira incluir ou excluir?" →
**Não / Sim**.

### O que isso muda no nosso sistema

A premissa antiga era: "a planilha tem o grupo familiar e o robô DIGITA cada
integrante no GERID". **Está errada.** Os integrantes vêm do CadÚnico; o robô
não os cria. O papel da nossa planilha muda para: **dizer, por CPF, qual
Parentesco e qual Estado Civil marcar** em cada linha que o GERID já mostrou.

Implicações:
- O casamento planilha ↔ GERID é **por CPF**.
- Se a planilha listar gente diferente do CadÚnico, há divergência a tratar
  (integrante do CadÚnico sem correspondência na planilha, e vice-versa).
- Nossos parentescos finos (Mãe, Pai, Irmão(ã)...) precisam mapear para os
  grupos do GERID (Pai/Mãe/Padrasto/Madrasta, Irmão/Irmã, etc.). **VERIFICAR**
  a lista completa de opções do select.

## Documentos — slots nomeados (passo 7, Anexos)

O GERID tem caixas de upload SEPARADAS por tipo. Cada arquivo vai na caixa certa:

| Slot no GERID | Obrig.? | No exemplo do Fabrício |
|---|---|---|
| Termo de representação da entidade conveniada | ✅ | `Termo de representação.pdf` |
| Documento de identificação do procurador (OAB/RG/CNH/CTPS) | | `OAB.pdf` |
| Comprovante da representação legal, se for o caso | | `Procuração INSS.pdf` |
| Curatela/tutela/termo de guarda e termo de responsabilidade | | — |
| Documentos de identificação do representante legal | | — |
| Documentos de identificação do interessado | ✅ | `CERTIDÃO DE NASCIMENTO.pdf` |
| Documento de identificação de todos os membros do grupo familiar | | `Cad.Único.pdf` |
| Comprovantes das relações previdenciárias | | — |
| Outros documentos | | — |
| Documento Médico (aceita vários) | | `RECEITAS MÉDICAS.pdf`, `RELATÓRIO ESCOLAR.pdf` |
| Comprovante do cadastro biométrico do titular | | `TÍTULO ELEITORAL.pdf` |
| Comprovante do cadastro biométrico do representante legal | | — |

**VERIFICAR/DECISÃO:** como a pasta do cliente no Drive nomeia cada documento
precisa casar com esses slots. Nossos tipos atuais (Termo, Procuração, CadÚnico,
Documentos médicos, Documentos pessoais, OAB) mapeiam quase 1:1, mas "Documentos
pessoais" precisa virar "identificação do interessado", e falta uma regra para
os slots opcionais.

## Gate de biometria (bloqueio real, fora do robô)

Ao concluir, apareceu o aviso: **"O pedido ainda não está concluído. É
necessário realizar o cadastro biométrico do interessado para a conclusão do
pedido."** Ou seja: sem o interessado ter **cadastro biométrico** no gov.br, o
GERID não conclui o protocolo — por mais que o robô preencha tudo. Muitos
requerentes de BPC (idosos, PcD de baixa renda) não têm biometria. Isso é uma
realidade por caso que nenhum robô resolve. **DECISÃO** de como tratar
(protocolar mesmo assim / marcar como pendência / pular).

## Confirmações que já batem com o sistema

- **5 MB por arquivo, 50 MB no total** — igual ao nosso `LIMITE_ARQUIVO_MB`.
- **Seleção de unidade por CEP** — por isso a planilha tem CEP.
- **Procurador = Fabrício** (CPF `047.947.501-61`) — igual ao `.env`.
- **E-mail do escritório** `inssclientefd@gmail.com` — igual ao `.env`.

## Decisões do escritório (Fabrício, 23/07/2026) — JÁ CODIFICADAS

Respondidas e travadas em `src/modulo2/regrasPreenchimento.ts` (com testes):

- **Respostas fixas** (iguais em todo caso): Comprometimento de Renda = Não;
  Proteção Especial SUAS = Não; Estrangeiro = Não; Representante Legal = Não;
  Procurador = Sim; Onde mora = "Moro em residência"; Recebe benefício = Não;
  desligamento Bolsa Família = Sim; alterar data do pedido = Sim.
- **Forma de Convívio**: deriva do grupo — só o Titular ⇒ "Sozinho"; senão
  "Com pessoas da família". (Rótulo "Sozinho" a CONFIRMAR na tela.)
- **Estado Civil**: padrão **Solteiro** para todos; só muda quando a planilha
  disser outra coisa (ex.: cliente com certidão de casamento).
- **Parentesco**: mapeado da planilha para os grupos do GERID (Pai/Mãe/…,
  Irmão/Irmã confirmados; Cônjuge/Filho/Avô a CONFIRMAR). Parentesco que não
  casa ⇒ o robô NÃO chuta, vira pendência.
- **Órgão Pagador / Unidade**: escolhe a agência da **mesma cidade** do cliente,
  mesmo que a primeira da lista seja de outra cidade. Nenhuma casa ⇒ pendência.
- **Biometria**: seguir o preenchimento até o fim mesmo sem biometria; o
  Fabrício resolve manualmente em "cumprimento de exigência".
- **Humano no laço**: o robô preenche os passos 1–9 e **para no Confirmar**;
  quem conclui/protocola é o Fabrício. (Ele ainda vai confirmar isso com o
  Dr. Fabrício.)

## O que falta para o "Executar" ligar

1. ~~Escrever o preenchimento Playwright dos passos 1–9~~ **FEITO** — está em
   `src/modulo2/preencherGerid.ts` (rascunho), parando no Confirmar, sobre as
   regras testadas de `regrasPreenchimento.ts`. Ligado ao robô via
   `RoboGeridPlaywright.preencherAteConfirmar()`.
2. **Sessão de validação** no GERID real (na máquina do Fabrício, sessão dele),
   com `pnpm gerid:testar [CPF]`: o robô preenche um caso até o Confirmar e
   **para**; a gente confere os seletores contra a tela real e ajusta os
   rótulos marcados `VALIDAR` (opção "sozinho", parentescos cônjuge/filho/avô,
   como a busca de CPF dispara). Não dá para validar de outro jeito sem
   protocolar pedido real.
3. Depois da validação: ligar a trava (`mapeamentoCompleto` → true) e o botão
   "Executar" sai de "Em desenvolvimento".

### Como rodar a sessão de validação (na máquina do advogado)

1. Abrir o Chrome no perfil `RPA_PERFIL_NAVEGADOR` e **logar no GERID** uma vez.
2. `RPA_GERID_URL=https://novorequerimento.inss.gov.br` no `.env`.
3. `pnpm gerid:testar` (ou `pnpm gerid:testar <CPF>` para um caso específico).
4. O robô abre o GERID, preenche até o Confirmar e para. Conferir os avisos que
   ele imprime e a tela; ajustar os seletores em `preencherGerid.ts` onde não
   bater. Repetir até preencher limpo. **O robô nunca conclui — quem protocola
   é o advogado.**

## Recomendação de arquitetura (humano no laço)

Protocolar é irreversível e afeta o direito de uma pessoa com deficiência. O robô
deve preencher os passos 1–9 (o trabalho chato), **parar no passo 10 (Confirmar)**
e devolver o controle ao Fabrício para ELE revisar e clicar em concluir. Assim o
robô economiza o tempo todo, mas nenhum protocolo é enviado ao INSS sem revisão
humana. Testar de outro jeito significaria protocolar pedidos reais — inviável.
