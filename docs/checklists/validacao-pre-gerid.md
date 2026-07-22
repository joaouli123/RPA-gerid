# Checklist — Validação de dados antes de rodar no Gerid de verdade

Objetivo: **nunca protocolar com dado incompleto/errado**. Rodar `pnpm demo` (ou o run real em modo
leitura) e conferir o relatório antes de acionar o Módulo 2.

## Antes de qualquer run real

- [ ] `pnpm test` verde e `pnpm typecheck` sem erro.
- [ ] Limite por arquivo = **5 MB** (confirmado pelo Gerid em 2026-07-20).
- [ ] `.env` com `RPA_TELEFONE_PADRAO` e `RPA_PROCURADOR_*` preenchidos.
- [ ] `RPA_GOOGLE_KEY_FILE` apontando para o JSON da service account
      (ver `docs/service-account.md`) — senão o app roda com dados de exemplo.
- [ ] Mapeamento de colunas confere com os cabeçalhos reais (aceita apelidos; se surgir um rótulo
      novo, acrescente à lista em `config/default.ts`).
- [ ] Padrões de nome (`documentosEsperados`) casam os nomes reais usados nas pastas.
- [ ] ⚠️ **Confirme que o caso não foi protocolado antes** — a pasta de teste tem um cliente que
      já foi protocolado de verdade no INSS.

## Por cliente marcado como "PRONTO"

- [ ] CPF do requerente tem 11 dígitos e bate com o CPF do `Titular` no grupo familiar.
      Atenção a CPF que começa com zero (a planilha numérica come o dígito).
- [ ] Grupo familiar tem exatamente 1 `Titular` e o número de integrantes bate com o CadÚnico.
- [ ] Os **4 documentos obrigatórios** existem e nenhum arquivo passa de 5 MB.
- [ ] Cidade e **CEP** preenchidos (o CEP é o que localiza a agência).

## Cuidados com a detecção de documento por nome (frágil de propósito)

- [ ] "Termo de representação" e "Procuração" são documentos **diferentes** — confira que os
      padrões não se sobrepõem (há teste cobrindo isso).
- [ ] Um mesmo arquivo pode casar **mais de um** tipo — confira se cada obrigatório tem o
      documento certo, não só um nome parecido.
- [ ] Documento presente mas **errado** (nome bate, conteúdo não) o robô **não pega** — amostragem
      manual recomendada.
- [ ] Documentos médicos costumam ser vários arquivos; todos contam para o mesmo tipo.
- [ ] Facultativo ausente (médicos / CadÚnico) **não** bloqueia: some do bloqueio, mas aparece no
      checklist da tela do cliente.

## Regra de ouro

Na dúvida, **mande para revisão manual** com um `MotivoRevisao` claro. Falso "pronto" é pior que
falso "revisão": protocolar errado no INSS tem custo real para o cliente.
