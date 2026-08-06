import { MockPage } from './playwright-polyfill';
import { preencherRequerimento } from './preencherGerid';
import { ErroGerid } from './tiposGerid';

function logToBackground(message: string) {
  console.log(message);
  try {
    // Envia o log para o popup. Se der erro de contexto inválido, engole.
    chrome.runtime.sendMessage({ action: 'log', message }).catch(() => {});
  } catch (e) {}
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

    // Sobrescreve o console.log temporariamente para capturar os logs do preencherRequerimento
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog(...args);
      logToBackground(args.join(' '));
    };

    let res;
    try {
      res = await preencherRequerimento(page, caso.dados, opcoes);
    } finally {
      console.log = originalLog;
    }
    
    if (res.pronto) {
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
