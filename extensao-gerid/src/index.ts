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
    // Opções baseadas no código original de configuração
    const opcoes = {
      procuradorCpf: '', 
      telefonePadrao: '11999999999', 
      emailEscritorio: 'contato@escritorio.com.br',
      arquivos: [] // não estamos enviando arquivos ainda
    };

    const dados = {
      cpf: caso.cpf,
      nome: caso.nome,
      pericia: caso.pericia
    };

    // Sobrescreve o console.log temporariamente para capturar os logs do preencherRequerimento
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog(...args);
      logToBackground(args.join(' '));
    };

    const res = await preencherRequerimento(page, dados, opcoes);
    
    // Restaura console
    console.log = originalLog;

    if (res.pronto) {
      logToBackground(`[ROBÔ FINALIZADO] Sucesso.`);
      return { status: 'sucesso', protocolo: 'EXTENSAO_FINALIZOU_SUCESSO' };
    } else {
      const msgs = res.avisos.map(a => a.mensagem).join(' | ');
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
