// Cole no Console (F12) COM O MODAL "Contatos" ABERTO (passo 7).
// Reproduz o que o robô faz e mostra onde a linha deixa de nascer.
// NÃO fecha o modal. NÃO avança o requerimento.
(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const raiz = document.querySelector('#contatos') || document.body;

  const props = (el) => {
    if (!el) return null;
    const n = Object.getOwnPropertyNames(el);
    const k = n.find((x) => x.startsWith('__reactProps$'));
    if (k) return el[k];
    const kf = n.find((x) => x.startsWith('__reactFiber$'));
    let f = kf ? el[kf] : null;
    for (let i = 0; f && i < 6; i++, f = f.return) if (f.memoizedProps) return f.memoizedProps;
    return null;
  };
  const clicarReal = (el) => {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, composed: true, button: 0, view: window }));
    }
  };
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  // ---- 1. inventário: quais ids existem MESMO dentro do modal
  const inventario = {
    achouRaizContatos: Boolean(document.querySelector('#contatos')),
    campos: [...raiz.querySelectorAll('input, textarea')].map((e) => ({
      id: e.id, type: e.type, value: e.value, placeholder: e.placeholder,
      disabled: e.disabled, readOnly: e.readOnly,
    })),
    botoes: [...raiz.querySelectorAll('button, [role="button"]')].map((b) => ({
      texto: txt(b), id: b.id, disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      visivel: b.getClientRects().length > 0,
    })),
    linhasNaTabela: [...raiz.querySelectorAll('table tbody tr')].map(txt),
  };

  // ---- 2. selecionar "Celular" pelo clique real no item (caminho provado no passo 4)
  const combo = document.getElementById('selectTipoContato');
  const lista = document.getElementById('selectTipoContato-itens');
  const opcoes = [...(lista?.querySelectorAll('.br-item') || [])].map(txt);
  const alvo = [...(lista?.querySelectorAll('.br-item') || [])]
    .find((i) => txt(i).toLowerCase().startsWith('celular'));
  if (alvo) clicarReal(alvo);
  await espera(500);

  const propsCombo = props(combo);
  const depoisDoTipo = {
    opcoesDisponiveis: opcoes,
    achouOpcaoCelular: Boolean(alvo),
    valueNoInput: combo?.value,
    // se o React tiver o item selecionado, costuma aparecer aqui:
    propsValue: propsCombo?.value,
    propsSelected: propsCombo?.selected ?? propsCombo?.defaultValue,
  };

  // ---- 3. preencher o valor do MESMO jeito que o robô (native setter + input/change)
  const campo = document.getElementById('valorContatoInteressado');
  const preencherComoRobo = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, v) : (el.value = v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const TESTE = '11987654321';
  if (campo) { campo.focus(); preencherComoRobo(campo, TESTE); }
  await espera(400);

  const propsCampo = props(campo);
  const depoisDoValor = {
    existeCampo: Boolean(campo),
    valueNoInput: campo?.value,
    propsValue: propsCampo?.value,
    // se propsValue continuar vazio com o input preenchido, o React NÃO recebeu
    reactRecebeu: propsCampo ? String(propsCampo.value ?? '') === TESTE : 'sem props',
  };

  // ---- 4. estado do botão Adicionar ANTES de clicar
  const btnAdd = [...raiz.querySelectorAll('button, [role="button"]')]
    .find((b) => txt(b).toLowerCase() === 'adicionar');
  const antesDoClique = btnAdd
    ? { existe: true, disabled: btnAdd.disabled, ariaDisabled: btnAdd.getAttribute('aria-disabled'), temOnClick: typeof props(btnAdd)?.onClick }
    : { existe: false };

  // ---- 5. clicar em Adicionar e ver se nasce a linha
  if (btnAdd) clicarReal(btnAdd);
  await espera(1500);

  const depoisDoClique = {
    linhasNaTabela: [...raiz.querySelectorAll('table tbody tr')].map(txt),
    comboFicouCom: document.getElementById('selectTipoContato')?.value,
    campoFicouCom: document.getElementById('valorContatoInteressado')?.value,
    alertas: [...raiz.querySelectorAll('.feedback, .br-message, [role="alert"], .invalid-feedback')]
      .map(txt).filter(Boolean),
  };

  const saida = { inventario, depoisDoTipo, depoisDoValor, antesDoClique, depoisDoClique };
  console.log(JSON.stringify(saida, null, 1));
  try { copy(JSON.stringify(saida)); } catch (e) {}
  return 'PRONTO — copie o JSON acima.';
})();
