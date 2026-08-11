# GERID - maquina de estados operacional

Validado no portal real em 11/08/2026. Este documento define o fluxo suportado
pela extensao para **Beneficio Assistencial a Pessoa com Deficiencia (servico
1655)**. Outros servicos podem exibir perguntas e regras juridicas diferentes e
nao sao processados automaticamente por este fluxo.

## Regra de seguranca

A extensao preenche ate `Confirmar`, valida que chegou a revisao e para. A
declaracao final e o envio permanecem humanos. SafeID e MFA tambem permanecem
humanos. Uma tela desconhecida nunca e tratada como sucesso.

## Estados reconhecidos

| Estado | Sinal principal | Acao | Prova de conclusao |
|---|---|---|---|
| `autenticacao_pat` | `LOGIN - PAT` e `Abrangencia` | Selecionar abrangencia disponivel, papel `ENTIDADE_CONVENIADA_OAB` e autorizar | Navegacao para o portal |
| `aviso_certificado_a3` | Texto do certificado A3 | Confirmar apenas o aviso informativo | Aviso deixa de ficar visivel |
| `lista_requerimentos` | Botao `Novo Requerimento` | Abrir novo rascunho | Campo do servico visivel |
| `passo_1` | `#idSelecionarServico` | Selecionar servico 1655 | Valor controlado contem BPC/deficiencia |
| `passo_2` | `#idRequerente.cpf` | Informar CPF e consultar | Nome retornado pelo GERID |
| `passo_3` | `#campo-autorizacaoCadunico` | Autorizar consulta ao CadUnico | Checkbox realmente marcado |
| `passo_4` | `selectEstadoCivil*` e Grupo Familiar | Casar linhas por CPF, preencher parentesco/estado civil e marcar nao para incluir/excluir | Todos os controles esperados confirmados |
| `passo_5` | `perguntaGastos-*` | Responder Nao | Controle realmente marcado |
| `passo_6` | `perguntaSUAS-*` | Responder Nao | Controle realmente marcado |
| `passo_7` | Acompanhamento e `.containerAnexo` | Contatos, perguntas adicionais, ciencias e anexos | Contatos aparecem na tabela, valores dos combos conferem e arquivos permanecem nos inputs |
| `passo_8` | CEP ou `Selecionar Unidade` | Buscar CEP e selecionar unidade da cidade | Card recebe `.selected` |
| `passo_9` | `#orgaoPagadorMunicipio` | Selecionar municipio e primeiro orgao retornado | Municipio e radio confirmados |
| `passo_10` | `#campo-declaracaoConfirmar` | Parar para revisao | Tela Confirmar visivel; nenhum clique final |
| `comprovante` | Comprovante e protocolo | Capturar protocolo apos confirmacao humana | Formato de protocolo valido |

## Modais e popups

- `Contatos`: faz parte do passo 7. Celular e e-mail sao adicionados somente se
  ainda nao existirem e sao conferidos na tabela antes de fechar.
- `Atencao / Confirmar`: e tratado como confirmacao final e nunca e confirmado
  automaticamente.
- Bloqueio por pedido aberto: encerra apenas aquele caso com o motivo devolvido
  pelo proprio GERID.
- Modal, alerta ou pergunta desconhecida: gera diagnostico sanitizado, preserva
  o caso na fila e nao avanca.

## Componentes especiais

- Os selects do GERID nao sao `<select>`. Abertura e escolha dependem de
  `mousedown`; `HTMLElement.click()` isolado nao atualiza o estado React/Redux.
- A SPA preserva etapas antigas ocultas no DOM. Toda busca considera somente
  elementos visiveis.
- IDs das opcoes se repetem entre comboboxes. A busca e sempre limitada ao
  container `{idDoCombo}-itens`.
- Os 11 inputs de anexo compartilham o id `single-file`, tem `multiple=true` e
  sao localizados pelo texto da caixa.
- Limites: 5 MB por arquivo e 50 MB no conjunto. Ambos sao validados antes de o
  caso entrar na fila.

## Recuperacao

- Rascunho intermediario encontrado antes de iniciar outro caso: recarregar a
  lista e recomecar o caso pendente.
- Tela `Confirmar` ou `Comprovante`: nunca recarregar automaticamente.
- Expiracao de sessao: preservar fila, solicitar SafeID/MFA e retomar.
- Reinicio do Chrome/service worker: recuperar execucao persistida.
- Falha de rede: manter caso pendente e usar retomada limitada.
- Estado desconhecido: registrar etapa, modal, alertas, ids de campos, botoes e
  slots de anexo sem valores pessoais.

## Criterio de sucesso

Preenchimento automatico concluido significa apenas: estado `passo_10`
reconhecido e pronto para revisao. Sucesso do protocolo so existe depois da
confirmacao humana e da captura de um numero de protocolo valido.
