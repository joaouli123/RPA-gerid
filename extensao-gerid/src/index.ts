import { MockPage } from './playwright-polyfill';
import { preencherRequerimento } from './preencherGerid';
import { ErroGerid } from './tiposGerid';

function logToBackground(message: string) {
  console.log(message);
  try {
    chrome.runtime.sendMessage({ action: 'log', message });
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'process_case') {
    const caso = request.caso;
    logToBackground(`Recebido comando para processar: ${caso.nome}`);
    
    // Inicia o processo assíncrono
    iniciarProcessamento(caso)
      .then(res => {
        logToBackground(`Processamento concluído com status: ${res.status}`);
        chrome.runtime.sendMessage({
          action: 'case_result',
          status: res.status,
          protocolo: res.protocolo,
          erro: res.erro
        });
      })
      .catch(err => {
        logToBackground(`Erro fatal no content script: ${err.message}`);
        chrome.runtime.sendMessage({
          action: 'case_result',
          status: 'erro',
          erro: err.message
        });
      });
  }
});

async function iniciarProcessamento(caso: any) {
  const page = new MockPage();
  
  // O content script já está na página do Gerid.
  try {
    // Para a extensão, nós passamos um procurador genérico nas opções por enquanto
    const opcoes = {
      procuradorCpf: '', 
      telefonePadrao: '11999999999',
      emailEscritorio: 'contato@escritorio.com.br',
      arquivos: []
    };
    
    // Mapeia os dados do cliente para o formato esperado pelo preencherGerid
    const dados = {
      cpf: caso.cpf,
      nome: caso.nome,
      pericia: caso.pericia
    };

    const res = await preencherRequerimento(page, dados, opcoes);
    
    if (res.pronto) {
      return { status: 'sucesso', protocolo: 'EXTENSAO_FINALIZOU_SUCESSO' };
    } else {
      return { status: 'erro', erro: res.avisos.map(a => a.mensagem).join(' | ') || 'Não finalizado' };
    }
  } catch (e) {
    if (e instanceof ErroGerid) {
      return { status: 'erro', erro: e.message };
    }
    return { status: 'erro', erro: e instanceof Error ? e.message : 'Erro interno no robô' };
  }
}
