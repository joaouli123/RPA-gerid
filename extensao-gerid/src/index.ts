import { MockPage } from './playwright-polyfill';
import { preencherRequerimento } from './preencherGerid';
import { ErroGerid } from './tiposGerid';
import { mapaGerid } from './mapaGerid';
import { classificarPreenchimento } from './classificarPreenchimento';
import { detectarProtocoloEmTexto } from './detectarProtocolo';
import {
  capturarDiagnosticoGerid,
  detectarEstadoGerid,
  listarPerguntasObrigatoriasPendentes,
  resumirDiagnosticoGerid,
} from './estadoGerid';

const CONTENT_BUILD_ID = '1.5.2-20260811.1';
(window as any).__GERID_RPA_CONTENT_BUILD__ = CONTENT_BUILD_ID;

function logToBackground(message: string) {
  console.log(message);
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

    const confirmacaoFinal = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .some((botao) => textoNormalizado(botao.innerText) === 'confirmar');
    if (textoPagina.includes('atencao') && confirmacaoFinal) {
      return {
        estado: 'revisao_manual',
        mensagem: 'Confirmacao final preservada para revisao humana.',
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
    if (resultado.status === 'revisao') {
      logToBackground(`[ROBÔ FINALIZADO] Preenchido para revisão humana.`);
      return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
    } else {
      logToBackground(`[ROBÔ FINALIZADO] Falha: ${resultado.erro}`);
      return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
    }
  } catch (e) {
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
(window as any).detectarProtocoloGerid = () => detectarProtocoloEmTexto(document.body?.innerText || '');
