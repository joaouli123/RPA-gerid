export type EtapaGerid =
  | 'autenticacao_pat'
  | 'aviso_certificado_a3'
  | 'lista_requerimentos'
  | 'passo_1'
  | 'passo_2'
  | 'passo_3'
  | 'passo_4'
  | 'passo_5'
  | 'passo_6'
  | 'passo_7'
  | 'passo_8'
  | 'passo_9'
  | 'passo_10'
  | 'comprovante'
  | 'desconhecido';

export interface EstadoGerid {
  etapa: EtapaGerid;
  modal: 'contatos' | 'confirmacao_final' | null;
}

export interface DiagnosticoGerid {
  etapa: EtapaGerid;
  modal: EstadoGerid['modal'];
  caminho: string;
  alertas: string[];
  campos: Array<{ id: string; tipo: string; preenchido: boolean; obrigatorio: boolean }>;
  botoes: Array<{ texto: string; desabilitado: boolean }>;
  anexos: Array<{ indice: number; rotulo: string; arquivo: boolean }>;
}

// O seletor de campos pega os três: `select` e `textarea` também respondem por
// pergunta do wizard, e tratá-los como `input` deixava o ramo do `tagName`
// inalcançável para o compilador.
type CampoFormulario = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function estaVisivel(elemento: Element | null): elemento is HTMLElement {
  if (!(elemento instanceof HTMLElement)) return false;
  if (elemento instanceof HTMLInputElement && elemento.type === 'file') {
    elemento = elemento.closest<HTMLElement>('.containerAnexo') ?? elemento;
  }
  if (!elemento.isConnected) return false;
  const estilo = window.getComputedStyle(elemento);
  return estilo.display !== 'none' &&
    estilo.visibility !== 'hidden' &&
    estilo.visibility !== 'collapse' &&
    elemento.getClientRects().length > 0;
}

function normalizar(texto: string | null | undefined): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textoVisivel(documento: Document): string {
  return normalizar(documento.body?.innerText);
}

function seletorVisivel(documento: Document, seletor: string): boolean {
  return Array.from(documento.querySelectorAll(seletor)).some(estaVisivel);
}

function textoTem(documento: Document, trecho: string): boolean {
  return textoVisivel(documento).includes(normalizar(trecho));
}

export function detectarEstadoGerid(documento: Document = document): EstadoGerid {
  const texto = textoVisivel(documento);
  const dialogos = Array.from(documento.querySelectorAll('[role="dialog"]')).filter(estaVisivel);
  const modalContatos = dialogos.some((dialogo) => normalizar(dialogo.innerText).includes('contatos'));
  const modalConfirmacao = dialogos.some((dialogo) => {
    const conteudo = normalizar(dialogo.innerText);
    return conteudo.includes('atencao') && conteudo.includes('confirmar');
  });

  let etapa: EtapaGerid = 'desconhecido';
  if (texto.includes('login - pat') && texto.includes('abrangencia')) etapa = 'autenticacao_pat';
  else if (texto.includes('certificado digital do tipo a3')) etapa = 'aviso_certificado_a3';
  else if (seletorVisivel(documento, 'input[id="campo-declaracaoConfirmar"]')) etapa = 'passo_10';
  else if (
    texto.includes('protocolo') &&
    Array.from(documento.querySelectorAll<HTMLElement>('h1, h2, h3')).some((titulo) =>
      estaVisivel(titulo) && normalizar(titulo.innerText) === 'comprovante'
    )
  ) etapa = 'comprovante';
  else if (seletorVisivel(documento, '#orgaoPagadorMunicipio')) etapa = 'passo_9';
  else if (
    seletorVisivel(documento, 'input[placeholder="__.___-___"]') ||
    (texto.includes('selecionar unidade') && texto.includes('consultar por cep'))
  ) etapa = 'passo_8';
  else if (
    seletorVisivel(documento, 'input[id="acompanharProcesso-Sim"]') &&
    seletorVisivel(documento, '.containerAnexo')
  ) etapa = 'passo_7';
  else if (seletorVisivel(documento, 'input[id^="perguntaSUAS-"]')) etapa = 'passo_6';
  else if (seletorVisivel(documento, 'input[id^="perguntaGastos-"]')) etapa = 'passo_5';
  else if (seletorVisivel(documento, 'input[id^="selectEstadoCivil"]')) etapa = 'passo_4';
  else if (seletorVisivel(documento, 'input[id="campo-autorizacaoCadunico"]')) etapa = 'passo_3';
  else if (seletorVisivel(documento, 'input[id="idRequerente.cpf"]')) etapa = 'passo_2';
  else if (seletorVisivel(documento, 'input[id="idSelecionarServico"]')) etapa = 'passo_1';
  else if (Array.from(documento.querySelectorAll('button')).some((botao) =>
    estaVisivel(botao) && normalizar(botao.innerText) === 'novo requerimento'
  )) etapa = 'lista_requerimentos';

  return {
    etapa,
    modal: modalContatos ? 'contatos' : modalConfirmacao ? 'confirmacao_final' : null,
  };
}

function textoSeguro(valor: string): string {
  return valor
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/\b\d{10,13}\b/g, '[numero]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

/** Caixa de anexo com arquivo dentro ganha um controle para tirá-lo de novo. */
function temControleDeRemocao(caixa: Element | null): boolean {
  if (!caixa) return false;
  return Array.from(caixa.querySelectorAll('button, a, [role="button"]')).some((controle) => {
    const texto = normalizar([
      controle.getAttribute('aria-label'),
      controle.getAttribute('title'),
      controle.textContent,
    ].join(' '));
    return texto.includes('excluir') || texto.includes('remover');
  });
}

export function capturarDiagnosticoGerid(documento: Document = document): DiagnosticoGerid {
  const estado = detectarEstadoGerid(documento);
  // Um par Sim/Não do GERID são dois checkboxes irmãos (`X-Sim` e `X-Nao`).
  // Responder "Sim" deixa o "Não" desmarcado — o que é a resposta certa, não
  // um campo em branco. Sem isto o diagnóstico acusava `acompanharProcesso-Nao`
  // como pendente numa pergunta que estava respondida.
  const respondidoNoPar = (campo: Element): boolean => {
    const par = /^(.+)-(sim|n[aã]o)$/i.exec(campo.id || '');
    if (!par) return false;
    return Array.from(documento.querySelectorAll<HTMLInputElement>(`[id^="${CSS.escape(par[1]!)}-"]`))
      .some((irmao) => irmao.checked);
  };

  // O GERID marca campo obrigatório com "*" no rótulo. Sem essa distinção o
  // relatório de falha citava "Conhecido por/Apelido" — que é opcional — no
  // mesmo tom do que realmente faltava, e mandava procurar no lugar errado.
  const ehObrigatorio = (campo: CampoFormulario): boolean => {
    if (campo.required || campo.getAttribute('aria-required') === 'true') return true;
    const rotulos = [
      campo.id ? documento.querySelector(`label[for="${CSS.escape(campo.id)}"]`)?.textContent : '',
      campo.getAttribute('aria-label'),
      campo.closest('label')?.textContent,
    ];
    return rotulos.some((rotulo) => (rotulo || '').trim().startsWith('*'));
  };

  const campos = Array.from(
    documento.querySelectorAll<CampoFormulario>('input, textarea, select'),
  )
    // Anexo não é campo de texto: `input[type=file]` aparece vazio por
    // natureza e enchia o relatório com `single-file` repetido doze vezes,
    // escondendo a pendência de verdade. O estado dos anexos vai em `anexos`.
    .filter((campo) => estaVisivel(campo) && campo.type !== 'file')
    .slice(0, 60)
    .map((campo) => ({
      id: campo.id || campo.getAttribute('name') || '(sem id)',
      tipo: campo instanceof HTMLInputElement ? campo.type || 'text' : campo.tagName.toLowerCase(),
      preenchido: campo instanceof HTMLInputElement && ['checkbox', 'radio'].includes(campo.type)
        ? campo.checked || respondidoNoPar(campo)
        : Boolean(campo.value),
      obrigatorio: ehObrigatorio(campo),
    }));

  const alertas = Array.from(
    documento.querySelectorAll<HTMLElement>('[role="alert"], .br-message, .feedback'),
  )
    .filter(estaVisivel)
    .map((alerta) => textoSeguro(alerta.innerText))
    .filter(Boolean)
    .slice(0, 10);

  const botoes = Array.from(documento.querySelectorAll<HTMLButtonElement>('button'))
    .filter(estaVisivel)
    .map((botao) => ({
      texto: textoSeguro(botao.innerText || botao.getAttribute('aria-label') || ''),
      desabilitado: botao.disabled || botao.getAttribute('aria-disabled') === 'true',
    }))
    .filter((botao) => botao.texto)
    .slice(0, 30);

  const anexos = Array.from(documento.querySelectorAll<HTMLInputElement>('.containerAnexo input[type="file"]'))
    .filter(estaVisivel)
    .map((input, indice) => ({
      indice,
      rotulo: textoSeguro(
        input.closest<HTMLElement>('.containerAnexo')?.querySelector<HTMLElement>('strong')?.innerText ||
        input.closest<HTMLElement>('.containerAnexo')?.innerText || '',
      ),
      // ⚠️ `input.files` não diz se o anexo está lá. Quando o GERID assume o
      // arquivo ele ESVAZIA o input e passa a mostrar o nome com um botão de
      // excluir. Ler só o input reportava "11/11 sem arquivo" numa tela onde os
      // anexos tinham entrado — e isso já mandou a investigação para o lado
      // errado uma vez.
      arquivo: Boolean(input.files?.length) || temControleDeRemocao(input.closest('.containerAnexo')),
    }));

  return {
    ...estado,
    caminho: window.location.pathname,
    alertas,
    campos,
    botoes,
    anexos,
  };
}

export function listarPerguntasObrigatoriasPendentes(documento: Document = document): string[] {
  const compactar = (valor: string) => valor.replace(/\s+/g, ' ').trim();
  return Array.from(documento.querySelectorAll<HTMLInputElement>('input[role="combobox"][id^="ca-"]'))
    .filter((combo) => estaVisivel(combo) && !combo.value.trim())
    .map((combo) => {
      let pai: HTMLElement | null = combo.parentElement;
      for (let nivel = 0; pai && nivel < 6; nivel++, pai = pai.parentElement) {
        const texto = compactar(pai.innerText || '');
        const pergunta = texto.split(/(?=Selecione o item|Exibir lista)/)[0]?.trim();
        if (pergunta && pergunta.length > 10 && pergunta.length < 500) {
          return pergunta.replace(/^\*\s*/, '');
        }
      }
      return combo.id;
    });
}

export function resumirDiagnosticoGerid(diagnostico: DiagnosticoGerid): string {
  const alertas = diagnostico.alertas.length ? ` Alertas: ${diagnostico.alertas.join(' | ')}.` : '';
  // Só o que é obrigatório e está vazio merece o nome de "pendente". Campo
  // opcional em branco vira ruído e desvia a leitura do erro.
  const vazios = diagnostico.campos.filter((campo) => !campo.preenchido);
  const pendentes = vazios.filter((campo) => campo.obrigatorio).map((campo) => campo.id).slice(0, 12);
  const anexosVazios = diagnostico.anexos.filter((anexo) => !anexo.arquivo).length;
  return `Estado ${diagnostico.etapa}${diagnostico.modal ? `, modal ${diagnostico.modal}` : ''}.` +
    (pendentes.length ? ` Campos obrigatórios pendentes: ${pendentes.join(', ')}.` : '') +
    (anexosVazios ? ` Caixas de anexo sem arquivo: ${anexosVazios}/${diagnostico.anexos.length}.` : '') +
    alertas;
}
