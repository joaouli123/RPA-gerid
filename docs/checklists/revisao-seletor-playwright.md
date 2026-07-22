# Checklist — Robustez de seletor Playwright (Módulo 2)

Seletor frágil é a **maior causa de quebra** em RPA de sistema de terceiros (o Gerid muda o HTML sem
avisar). Rode este checklist ao escrever/revisar qualquer interação com a página do Gerid.

## Prioridade de seletores (do mais robusto ao mais frágil)

1. **Papel + nome acessível**: `page.getByRole('button', { name: 'Finalizar' })`.
2. **Label de formulário**: `page.getByLabel('CPF do requerente')`.
3. **Texto visível estável**: `page.getByText('Assistencial à Pessoa com Deficiência')`.
4. **`data-*` de teste**, se o Gerid tiver algum atributo estável.
5. ⚠️ **CSS/XPath posicional** (`div:nth-child(3) > ...`) — último recurso, marque com `// FRÁGIL`.

## Regras

- [ ] **Nunca** dependa de índice posicional (`nth`, `first`) sem um seletor de contexto por perto.
- [ ] **Nunca** dependa de classes CSS geradas/hash (ex.: `.css-1a2b3c`).
- [ ] Prefira seletor **por acessibilidade** (role/label) ao invés de estrutura do DOM.
- [ ] Ancore em texto **em português exatamente como o Gerid mostra** (cuidado com acento/caixa).
- [ ] Toda espera é por **condição** (`await expect(locator).toBeVisible()`), nunca `waitForTimeout` fixo.
- [ ] Ações de digitação conferem o valor depois (`toHaveValue`) — campos com máscara mudam o valor digitado.
- [ ] Passos irreversíveis (Finalizar, Confirmar) ficam atrás de uma verificação explícita do estado esperado.
- [ ] Cada seletor tem **fallback + erro claro** ("campo X não encontrado — layout do Gerid pode ter mudado")
      que direciona o caso para **revisão manual** com motivo, em vez de estourar exceção crua.
- [ ] Timeout e retry são **configuráveis** por passo (rede do INSS oscila).
- [ ] Upload de arquivo usa `setInputFiles` no `<input type=file>`, não simulação de clique+diálogo do SO.
- [ ] Screenshot automático em falha (para diagnóstico posterior).

## Mapeamento (preencher durante o Módulo 2 — NÃO inventar)

Confirmar no Gerid real e anotar aqui: rótulos exatos de cada campo, ordem das telas e onde/como o
comprovante é baixado.

Já sabemos (cliente, 2026-07-20):
- A agência é escolhida **pelo CEP** do protocolo.
- O limite de anexo é **5 MB por arquivo**.
- O comprovante é salvo na pasta do cliente como `comprovante protocolo`, e a pasta vai para
  `Protocolado/`.

❗ **A pergunta que ainda bloqueia:** quais campos o Gerid pede **por integrante** do grupo familiar
(só nome e CPF? parentesco? data de nascimento? renda?). Enquanto não confirmarmos, esses campos
ficam em `Integrante.camposAdicionais` e o preenchimento do grupo familiar não pode ser fechado.
Peça um print dessa etapa do Gerid.

⚠️ **Nunca reprotocolar.** A pasta de teste contém um caso que já foi protocolado de verdade no
INSS. Antes de rodar em produção, garanta que o robô só processa quem ainda não foi.
