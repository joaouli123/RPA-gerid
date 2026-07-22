# RPA Gerid

Robô que protocola requerimentos de **BPC/LOAS** no **Gerid (INSS/Dataprev)** a partir de dados e
documentos organizados no Google Drive de cada cliente.

> Documentação técnica e decisões de projeto: **[CLAUDE.md](./CLAUDE.md)**.
> Estrutura da planilha: **[docs/schema-planilha.md](./docs/schema-planilha.md)**.

## Rodar

```bash
pnpm install
pnpm dev         # painel web em http://localhost:3000
pnpm demo        # dry-run do Módulo 1 no terminal (não precisa de credenciais)
pnpm test        # suíte de testes
pnpm typecheck   # checagem de tipos
pnpm modelo      # gera docs/Protocolo-modelo.xlsx para o escritório preencher
```

## Módulos

1. **Módulo 1 — Leitura de dados** ✅ _implementado_
   Lê subpastas do Drive + planilha `.xlsx` (grupo familiar de tamanho variável), associa cada pasta
   ao cliente, valida os 4 documentos obrigatórios e o limite de 5 MB por arquivo. Separa
   **prontos** de **revisão manual**.
2. **Painel web (Next.js)** ✅ _implementado e funcional_
   Painel, clientes, detalhe, execução, revisão, relatórios e configurações — com estado persistido.
3. **Módulo 2 — Automação no Gerid (Playwright)** — _próximo_
4. **Módulo 3 — Comprovante no Drive + mover para `Protocolado/`** — _futuro_

## Configuração do run real

1. Crie a Service Account e baixe o JSON: **[docs/service-account.md](./docs/service-account.md)**.
2. Copie `.env.example` para `.env` e preencha (os IDs da pasta e da planilha reais já estão
   documentados). A suíte de testes **não** precisa disso.

Sem credencial o app roda com um dataset de exemplo, e o Painel avisa qual origem está ativa.
