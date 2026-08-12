import { MockPage } from './playwright-polyfill';
import { pedidoJaEmAberto, preencherRequerimento, vigiarPedidoEmAberto } from './preencherGerid';
import { ErroGerid } from './tiposGerid';
import { mapaGerid } from './mapaGerid';
import { classificarPreenchimento } from './classificarPreenchimento';
import {
  campoDaTelaDeTarefa,
  detectarProtocoloEmTexto,
  protocoloNaTelaDeTarefa,
} from './detectarProtocolo';
import { decidirModalDoEnvio } from './modaisDoEnvio';
import {
  capturarDiagnosticoGerid,
  detectarEstadoGerid,
  listarPerguntasObrigatoriasPendentes,
  resumirDiagnosticoGerid,
} from './estadoGerid';

const CONTENT_BUILD_ID = '1.6.0-20260812.29';
const EVENTO_LOG_GERID = '__gerid_rpa_log__';
const CANAL_CONTROLE_GERID = '__gerid_rpa_control__';
const emContextoExtensao = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
(window as any).__GERID_RPA_CONTENT_BUILD__ = CONTENT_BUILD_ID;
console.log(
  `[GERID RPA BUILD] ${CONTENT_BUILD_ID} carregado no contexto ${emContextoExtensao ? 'extensao' : 'pagina'}`,
);

if (emContextoExtensao) {
  document.documentElement.dataset.geridRpaControlBridge = CONTENT_BUILD_ID;
  window.addEventListener(EVENTO_LOG_GERID, (evento) => {
    const mensagem = (evento as CustomEvent<string>).detail;
    if (typeof mensagem !== 'string') return;
    chrome.runtime.sendMessage({ action: 'content_log', message: mensagem }).catch(() => {});
  });
  window.addEventListener('message', (evento) => {
    if (evento.source !== window || evento.data?.canal !== CANAL_CONTROLE_GERID) return;
    if (evento.data?.tipoMensagem !== 'solicitacao') return;
    const detalhe = evento.data;
    if (!detalhe.requestId || !detalhe.tipoControle || !detalhe.id) return;
    chrome.runtime.sendMessage({
      action: 'gerid_react_control',
      tipo: detalhe.tipoControle,
      id: detalhe.id,
      valor: detalhe.valor,
    }).then((resposta) => {
      window.postMessage({
        canal: CANAL_CONTROLE_GERID,
        tipoMensagem: 'resposta',
        requestId: detalhe.requestId,
        resposta,
      }, '*');
    }).catch((erro) => {
      window.postMessage({
        canal: CANAL_CONTROLE_GERID,
        tipoMensagem: 'resposta',
        requestId: detalhe.requestId,
        resposta: { ok: false, motivo: String(erro) },
      }, '*');
    });
  });
}

function logToBackground(message: string) {
  console.log(message);
  if (!emContextoExtensao) {
    window.dispatchEvent(new CustomEvent(EVENTO_LOG_GERID, { detail: message }));
    return;
  }
  try {
    // Envia o log para o popup. Se der erro de contexto inválido, engole.
    chrome.runtime.sendMessage({ action: 'content_log', message }).catch(() => {});
  } catch (e) {}
}

function textoNormalizado(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function elementoRenderizado(elemento: HTMLElement): boolean {
  const estilo = window.getComputedStyle(elemento);
  return elemento.isConnected &&
    estilo.display !== 'none' &&
    estilo.visibility !== 'hidden' &&
    estilo.visibility !== 'collapse' &&
    elemento.getClientRects().length > 0;
}

function selecionarOpcaoNativa(
  campo: HTMLSelectElement,
  localizar: (opcao: HTMLOptionElement) => boolean,
): boolean {
  const opcao = Array.from(campo.options).find(localizar);
  if (!opcao) return false;

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(campo, opcao.value);
  else campo.value = opcao.value;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

async function resolverBloqueiosConhecidosGerid() {
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    const textoPagina = textoNormalizado(document.body?.innerText);

    // Consentimento do PAT exibido depois do SafeID/MFA. Este modal precisa
    // ser concluido antes que /tarefas ou /requerimentos fique disponivel.
    if (textoPagina.includes('login - pat') && textoPagina.includes('abrangencia')) {
      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
        .filter(elementoRenderizado);
      const abrangencia = selects[0];
      const papel = selects[1];

      if (abrangencia && !abrangencia.value) {
        selecionarOpcaoNativa(abrangencia, (opcao) => Boolean(opcao.value));
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      if (papel && textoNormalizado(papel.selectedOptions[0]?.text) !== 'entidade_conveniada_oab') {
        const selecionou = selecionarOpcaoNativa(
          papel,
          (opcao) => textoNormalizado(opcao.text).includes('entidade_conveniada_oab'),
        );
        if (!selecionou) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const autorizar = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((botao) => textoNormalizado(botao.innerText) === 'autorizo');
      if (autorizar && !autorizar.disabled) {
        logToBackground('Autorizando abrangencia e papel no PAT...');
        autorizar.click();
        return { estado: 'navegando', mensagem: 'Autorizacao do PAT enviada.' };
      }
    }

    // Aviso informativo que aparece logo depois da autorizacao. Nao confundir
    // com o modal "Atencao/Confirmar" do protocolo, que deve continuar manual.
    if (textoPagina.includes('certificado digital do tipo a3')) {
      const ok = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((botao) => textoNormalizado(botao.innerText) === 'ok');
      if (ok && !ok.disabled) {
        logToBackground('Confirmando o aviso de certificado A3...');
        ok.click();
        return { estado: 'navegando', mensagem: 'Aviso do certificado A3 confirmado.' };
      }
    }

    // Modal "Atencao/Confirmar" JA ABERTO antes de o robo comecar: quem clicou
    // em Avancar foi outra pessoa, num requerimento que nao sabemos de quem e.
    // Confirmar por cima protocolaria o pedido de terceiro. O robo abre e
    // confirma o proprio modal dentro do passo 10, com o requerimento que ele
    // mesmo preencheu — isto aqui e so o caso do modal orfao.
    if (detectarEstadoGerid().modal === 'confirmacao_final') {
      return {
        estado: 'revisao_manual',
        mensagem: 'Ja havia uma confirmacao final aberta na tela. Resolva no Gerid antes de rodar o robo.',
      };
    }

    if (/^\/(tarefas|requerimentos)(?:\/|$)/.test(window.location.pathname)) {
      return { estado: 'livre', mensagem: 'Portal do GERID pronto.' };
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return {
    estado: 'aguardando',
    mensagem: 'O portal ainda aguarda uma etapa de autenticacao ou autorizacao.',
  };
}

(window as any).resolverBloqueiosGerid = resolverBloqueiosConhecidosGerid;
(window as any).obterEstadoGerid = () => detectarEstadoGerid();
(window as any).diagnosticarGerid = () => capturarDiagnosticoGerid();
(window as any).obterPendenciasGerid = () => listarPerguntasObrigatoriasPendentes();
/**
 * De QUEM é o requerimento que está aberto na tela?
 *
 * É a pergunta que decide entre retomar e recomeçar. Continuar o requerimento
 * de outra pessoa protocolaria dado de um cliente no nome de outro — por isso
 * "não sei" tem o mesmo peso de "não é": só um reconhecimento POSITIVO autoriza
 * retomar. O CPF é procurado em dígitos (pega `093.903.334-82` e `09390333482`)
 * e o nome sem acento nem caixa.
 */
(window as any).requerimentoAbertoEhDoCaso = (cpf: string, nome: string): 'sim' | 'nao' | 'indefinido' => {
  const bruto = document.body?.innerText || '';
  const texto = textoNormalizado(bruto);
  const digitosDaTela = bruto.replace(/\D/g, '');

  const cpfAlvo = String(cpf || '').replace(/\D/g, '');
  if (cpfAlvo.length === 11 && digitosDaTela.includes(cpfAlvo)) return 'sim';

  const nomeAlvo = textoNormalizado(String(nome || ''));
  if (nomeAlvo.length >= 6 && texto.includes(nomeAlvo)) return 'sim';

  // Nenhum sinal do nosso caso. Se há OUTRO CPF na tela, o requerimento é de
  // terceiro; se não há CPF nenhum, a tela simplesmente não mostra dono.
  const temAlgumCpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(bruto);
  return temAlgumCpf ? 'nao' : 'indefinido';
};

(window as any).reiniciarRequerimentoGerid = async () => {
  if (detectarEstadoGerid().etapa === 'passo_1') return true;

  const botaoPrimeiroPasso = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((botao) => {
      const texto = textoNormalizado(botao.innerText);
      return elementoRenderizado(botao) && texto.includes('selecionar servico');
    });
  if (!botaoPrimeiroPasso) return false;

  botaoPrimeiroPasso.click();
  const limite = Date.now() + 5_000;
  while (Date.now() < limite) {
    if (detectarEstadoGerid().etapa === 'passo_1') return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
};

async function abrirNovoRequerimentoSeNecessario(page: MockPage): Promise<void> {
  // Retomada: o wizard já está aberto no meio do caminho. Procurar aqui a tela
  // de serviços (que não existe mais) só gastaria 15s antes de um erro falso —
  // era isso que travava a segunda tentativa. O preenchimento sabe continuar.
  const etapaAgora = detectarEstadoGerid().etapa;
  if (['passo_2', 'passo_3', 'passo_4', 'passo_5', 'passo_6', 'passo_7', 'passo_8', 'passo_9']
    .includes(etapaAgora)) {
    logToBackground(`Requerimento já aberto em ${etapaAgora}. Retomando de onde parou.`);
    return;
  }

  const seletorServico = page.locator(mapaGerid.passo1.campoBusca);
  const novoRequerimento = page.getByRole('button', { name: /^Novo Requerimento$/i });

  // O Gerid é uma SPA: a navegação termina antes de o conteúdo de
  // /requerimentos ser renderizado. Aguarde uma das duas telas válidas em vez
  // de transformar esse intervalo em erro fatal.
  const limite = Date.now() + 15_000;
  while (Date.now() < limite) {
    if (await seletorServico.isVisible().catch(() => false)) return;
    if (await novoRequerimento.isVisible().catch(() => false)) {
      logToBackground('Abrindo Novo Requerimento no Gerid...');
      await novoRequerimento.click();
      await seletorServico.waitFor({ state: 'visible', timeout: 15_000 });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    'Não encontrei a tela de serviços nem o botão "Novo Requerimento". Abra a lista de requerimentos do Gerid e tente novamente.',
  );
}

// Expõe a função no window do ISOLATED WORLD para ser chamada pelo executeScript
(window as any).iniciarProcessamento = async (caso: any) => {
  logToBackground(`[ROBÔ INICIADO] Processando caso: ${caso.nome}`);
  // Zera e religa a vigilância do bloqueio "pedido N em aberto" ANTES de tocar
  // na tela. Zerar é o ponto crítico: o content script continua vivo na mesma
  // aba entre casos, e um número lembrado do requerente anterior seria colado
  // neste aqui.
  vigiarPedidoEmAberto();
  const page = new MockPage();

  try {
    if (!caso?.dados?.cliente || !caso?.dados?.grupoFamiliar || !caso?.configuracao) {
      throw new Error('A extensão não recebeu os dados completos do caso. Atualize o painel e tente novamente.');
    }

    const opcoes = {
      procuradorCpf: caso.configuracao.procuradorCpf,
      telefonePadrao: caso.configuracao.telefonePadrao,
      emailEscritorio: caso.configuracao.emailEscritorio,
      arquivos: (caso.anexos || []).map((anexo: any) => ({
        tipo: anexo.tipo,
        nome: anexo.nome,
        caminho: anexo,
      })),
    };

    await abrirNovoRequerimentoSeNecessario(page);

    const inicioPreenchimento = performance.now();
    const temposEtapas: Array<{ etapa: string; duracaoMs: number }> = [];
    const res = await preencherRequerimento(page, caso.dados, opcoes, (etapa, duracaoMs) => {
      temposEtapas.push({ etapa, duracaoMs });
      logToBackground(`[TEMPO] ${etapa}: ${(duracaoMs / 1000).toFixed(1)}s`);
    });
    const duracaoTotalMs = Math.round(performance.now() - inicioPreenchimento);
    logToBackground(
      `[TEMPO] preenchimento total: ${(duracaoTotalMs / 1000).toFixed(1)}s`,
    );
    
    const resultado = classificarPreenchimento(res);
    if (resultado.status === 'sucesso') {
      logToBackground(`[ROBÔ FINALIZADO] PROTOCOLADO — protocolo ${resultado.protocolo}`);
      return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
    } else if (resultado.status === 'revisao') {
      logToBackground(`[ROBÔ FINALIZADO] Preenchido para revisão humana.`);
      return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
    } else {
      logToBackground(`[ROBÔ FINALIZADO] Falha: ${resultado.erro}`);
      return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
    }
  } catch (e) {
    // Etapa que ESTOURA nao passa pelo laco de preencherRequerimento, e o motivo
    // do estouro pode ser justamente o GERID recusando um caso ja protocolado.
    const jaAberto = pedidoJaEmAberto();
    if (jaAberto) {
      logToBackground(`[ROBÔ FINALIZADO] JÁ PROTOCOLADO — pedido ${jaAberto} em aberto; não refiz.`);
      return {
        status: 'sucesso',
        protocolo: jaAberto,
        erro: `O GERID recusou refazer: já existe o pedido ${jaAberto} em aberto para este CPF.`,
      };
    }
    const errorMsg = e instanceof Error ? e.message : 'Erro interno no robô';
    const diagnostico = capturarDiagnosticoGerid();
    const contexto = resumirDiagnosticoGerid(diagnostico);
    logToBackground(`[ROBÔ FINALIZADO com ERRO FATAL]: ${errorMsg} ${contexto}`);
    
    if (e instanceof ErroGerid) {
      return { status: 'erro', erro: `${e.message} ${contexto}`, diagnostico };
    }
    return { status: 'erro', erro: `${errorMsg} ${contexto}`, diagnostico };
  }
};

// A tela final pode ser renderizada sem trocar a URL da SPA. O background
// consulta esta funcao depois que o operador confirma manualmente.
//
// ⚠️ A TELA IMPORTA. Antes esta funcao lia o `innerText` da pagina INTEIRA sem
// olhar em que etapa o GERID estava — e a lista de requerimentos e uma tabela
// com uma coluna "Protocolo" cheia de numeros de OUTROS requerimentos. Como a
// verificacao de confirmacao roda de 6 em 6 segundos, bastava a aba passar pela
// lista (ou pelo modal "voce criou uma tarefa, protocolo ...") para o robo
// capturar protocolo de terceiro e registrar o caso como PROTOCOLADO sem nada
// ter sido enviado ao INSS. So a tela de comprovante responde por protocolo.
(window as any).detectarProtocoloGerid = () => {
  if (detectarEstadoGerid().etapa !== 'comprovante') return null;
  return detectarProtocoloEmTexto(document.body?.innerText || '');
};

/**
 * O protocolo na TELA DE DETALHE da tarefa (`/tarefas/detalhar_tarefa/…`).
 *
 * Ao confirmar o aviso de biometria o GERID nao abre o comprovante: ele
 * RECARREGA o navegador no detalhamento do requerimento. O laco que esperava o
 * numero morre junto com o documento antigo, e sem esta funcao o background so
 * enxergaria "a pagina recarregou" — e tentaria o caso de novo, criando um
 * segundo pedido para a mesma pessoa.
 *
 * Aqui nao ha o risco que obriga `detectarProtocoloGerid` a exigir a tela de
 * comprovante: a lista mostra protocolo de muita gente, o detalhamento mostra
 * UM requerimento, com o numero num campo rotulado. A conferencia de dono
 * continua sendo feita por `requerimentoAbertoEhDoCaso`.
 */
(window as any).protocoloDaTarefaNaTela = () => ({
  protocolo: protocoloNaTelaDeTarefa(document) || '',
  // A DATA vem junto porque e ela que separa "acabei de protocolar" de "esta
  // aberto na tela um BPC que esta pessoa pediu ano passado". E a mesma regra
  // que ja protege a leitura da lista de tarefas.
  protocoladoEm: campoDaTelaDeTarefa(document, 'protocolado em'),
});

/**
 * Diagnostico: o que o robo FARIA com o modal aberto agora — sem clicar.
 *
 * Existe para que a regra mais perigosa do robo (clicar em "Confirmar") possa
 * ser conferida na tela real e coberta por teste sem disparar o clique. Devolve
 * so o tipo e o texto; o elemento do botao fica de fora de proposito, para nao
 * dar a ninguem uma alca de clique atraves do console.
 */
(window as any).decidirModalDoEnvioGerid = () => {
  const decisao = decidirModalDoEnvio(document);
  return {
    tipo: decisao.tipo,
    texto: decisao.texto,
    algumDialogo: decisao.algumDialogo,
    // O modal que o robo NAO sabe tratar. E a saida mais util deste
    // diagnostico: com a frase e os rotulos na mao da para escrever a regra
    // sem inventar seletor.
    naoReconhecido: decisao.naoReconhecido,
  };
};

