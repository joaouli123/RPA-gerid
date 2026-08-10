import { MockPage } from './playwright-polyfill';
import { preencherRequerimento } from './preencherGerid';
import { ErroGerid } from './tiposGerid';
import { mapaGerid } from './mapaGerid';

function logToBackground(message: string) {
  console.log(message);
  try {
    // Envia o log para o popup. Se der erro de contexto inválido, engole.
    chrome.runtime.sendMessage({ action: 'content_log', message }).catch(() => {});
  } catch (e) {}
}

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
    await new Promise((resolve) => setTimeout(resolve, 100));
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

    const res = await preencherRequerimento(page, caso.dados, opcoes);
    
    const parouParaRevisao =
      res.pronto ||
      res.telaAtual === 'Dados do Requerente' ||
      res.telaAtual === 'Selecionar Unidade' ||
      res.telaAtual === 'Órgão Pagador';
    if (parouParaRevisao) {
      const aviso = res.avisos.join(' | ');
      logToBackground(`[ROBÔ FINALIZADO] Preenchido para revisão humana.`);
      return {
        status: 'revisao',
        erro: aviso || 'Preenchido até Confirmar. Revise os dados e conclua manualmente no Gerid.',
      };
    } else {
      const msgs = res.avisos.join(' | ');
      logToBackground(`[ROBÔ FINALIZADO] Falha: ${msgs}`);
      return { status: 'erro', erro: msgs || 'Não finalizado' };
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Erro interno no robô';
    logToBackground(`[ROBÔ FINALIZADO com ERRO FATAL]: ${errorMsg}`);
    
    if (e instanceof ErroGerid) {
      return { status: 'erro', erro: e.message };
    }
    return { status: 'erro', erro: errorMsg };
  }
};
