# Operacao do RPA GERID

## O que precisa estar pronto

1. SafeID Desktop instalado e aberto no computador do operador.
2. Computador vinculado ao aplicativo SafeID do titular do certificado.
3. Certificado digital valido e visivel no Windows/Chrome.
4. Acesso GERID ativo para o advogado ou operador.
5. Aplicativo autenticador disponivel para o codigo de 6 digitos.
6. Extensao Gerid RPA Automator 1.2.0 instalada no Chrome.
7. URL do Coolify e `RPA_EXTENSAO_TOKEN` configurados uma vez na extensao.

## Fluxo diario

1. Abra o SafeID Desktop e o Chrome.
2. Abra a extensao e mantenha o modo teste no primeiro uso.
3. Clique em **Preparar e iniciar**.
4. Quando o GERID solicitar, aprove o SafeID e informe o MFA.
5. Aguarde o preenchimento chegar a tela **Confirmar**.
6. Revise os dados, anexos e unidade de atendimento.
7. Confirme manualmente o requerimento.
8. Aguarde a extensao registrar o protocolo.
9. Com o modo teste desligado, o proximo caso inicia automaticamente.

## Limite da automacao

SafeID e MFA existem para comprovar a presenca do titular. O sistema nao tenta
burlar ou armazenar esses fatores. A automacao pausa, avisa o operador e retoma
sem perder a fila depois da autenticacao.

Nao existe API publica de protocolo BPC para este fluxo do GERID. A API BPC do
Conecta Gov serve para consulta de beneficio ativo e nao cria requerimentos.

## Diagnostico rapido

- **Erro de conexao na extensao:** conferir URL e `RPA_EXTENSAO_TOKEN`.
- **Autenticacao necessaria:** abrir a aba indicada e concluir SafeID/MFA.
- **Confirme no GERID:** revisar e clicar em Confirmar; o protocolo sera capturado.
- **Layout mudou:** parar a fila e revalidar os seletores antes de continuar.
- **Fila sem casos:** revisar documentos e dados no painel antes de iniciar.
