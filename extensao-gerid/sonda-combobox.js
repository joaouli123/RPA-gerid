// Cole no Console (F12) COM A TELA DO PASSO 4 TRAVADA.
// Testa 5 estratégias de seleção no combo selectEstadoCivil1 (linha da requerente),
// alvo "Solteiro". Limpa entre cada tentativa. NÃO clica em Avançar.
// Devolve qual estratégia realmente preencheu o campo.
(async () => {
  const ID = 'selectEstadoCivil1';
  const ALVO = 'Solteiro';
  const combo = document.getElementById(ID);
  const lista = document.getElementById(ID + '-itens');
  if (!combo || !lista) return 'ERRO: combo ou lista não encontrados — a tela é a do passo 4?';

  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  const itens = () => [...lista.querySelectorAll('.br-item')];
  const itemPorTexto = (txt) => itens().find(i =>
    (i.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().startsWith(txt.toLowerCase()));

  const props = (el) => {
    if (!el) return null;
    const n = Object.getOwnPropertyNames(el);
    const k = n.find(x => x.startsWith('__reactProps$'));
    if (k) return el[k];
    const kf = n.find(x => x.startsWith('__reactFiber$'));
    let f = kf ? el[kf] : null;
    for (let i = 0; f && i < 4; i++, f = f.return) if (f.memoizedProps) return f.memoizedProps;
    return null;
  };
  const clicarReal = (el) => {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, composed: true, button: 0, view: window }));
    }
  };
  const limpar = async () => {
    const l = itemPorTexto('Limpar');
    if (l) clicarReal(l);
    await espera(250);
    combo.blur?.();
    await espera(150);
  };
  const valor = () => combo.value;

  const resultados = [];
  const testar = async (nome, fn) => {
    await limpar();
    const antes = valor();
    let erro = null;
    try { await fn(); } catch (e) { erro = String(e?.message || e); }
    await espera(600);
    resultados.push({ estrategia: nome, antes, depois: valor(), ok: valor().trim().toLowerCase() === ALVO.toLowerCase(), erro });
  };

  // S1 — onChange do input com o value interno (o que o robô faz hoje)
  await testar('S1 onChange(input, "1")', () => {
    const p = props(combo);
    if (typeof p?.onChange !== 'function') throw new Error('onChange não é função');
    p.onChange({ type: 'change', target: { value: '1' }, currentTarget: combo, preventDefault(){}, stopPropagation(){}, persist(){}, isDefaultPrevented:()=>false, isPropagationStopped:()=>false, nativeEvent:null, bubbles:true, cancelable:true, defaultPrevented:false });
  });

  // S2 — clique real direto no .br-item, lista fechada
  await testar('S2 clique no .br-item (fechada)', () => {
    const it = itemPorTexto(ALVO);
    if (!it) throw new Error('item não encontrado');
    clicarReal(it);
  });

  // S3 — abre pelo botão data-trigger, depois clica no .br-item
  await testar('S3 abrir trigger + clicar item', async () => {
    const trigger = combo.parentElement?.querySelector('button[data-trigger]');
    if (!trigger) throw new Error('trigger não encontrado');
    clicarReal(trigger);
    await espera(300);
    const it = itemPorTexto(ALVO);
    if (!it) throw new Error('item sumiu depois de abrir');
    clicarReal(it);
  });

  // S4 — onMouseDown do .br-item via props do React
  await testar('S4 props.onMouseDown do item', () => {
    const it = itemPorTexto(ALVO);
    const p = props(it);
    if (typeof p?.onMouseDown !== 'function') throw new Error('onMouseDown não é função');
    p.onMouseDown({ type:'mousedown', target: it, currentTarget: it, preventDefault(){}, stopPropagation(){}, persist(){}, isDefaultPrevented:()=>false, isPropagationStopped:()=>false, nativeEvent:null, bubbles:true, cancelable:true, defaultPrevented:false });
  });

  // S5 — clique no radio interno
  await testar('S5 clique no radio', () => {
    const it = itemPorTexto(ALVO);
    const radio = it?.querySelector('input[type=radio]');
    if (!radio) throw new Error('radio não encontrado');
    clicarReal(radio);
  });

  // Bônus: o checkbox "Não" do incluir/excluir
  const nao = document.getElementById('undefined-Nao');
  const tag = nao?.closest('.interaction-select');
  const checkbox = { existe: !!nao, checkedAntes: nao?.checked, temTag: !!tag };
  if (tag) { clicarReal(tag); await espera(400); checkbox.checkedDepoisCliqueTag = nao.checked; }
  if (nao && !nao.checked) {
    const p = props(tag);
    checkbox.tagOnClick = typeof p?.onClick;
    if (typeof p?.onClick === 'function') {
      try { p.onClick({ type:'click', target: tag, currentTarget: tag, preventDefault(){}, stopPropagation(){}, persist(){}, isDefaultPrevented:()=>false, isPropagationStopped:()=>false, nativeEvent:null, bubbles:true, cancelable:true, defaultPrevented:false }); } catch(e) { checkbox.erroOnClick = String(e); }
      await espera(400);
      checkbox.checkedDepoisOnClick = nao.checked;
    }
  }

  const saida = {
    reactPropsNoCombo: !!props(combo),
    onChangeDoCombo: typeof props(combo)?.onChange,
    totalItens: itens().length,
    resultados,
    checkbox,
    valorFinalDoCampo: valor(),
  };
  console.table(resultados);
  console.log(JSON.stringify(saida, null, 1));
  copy?.(JSON.stringify(saida));
  return 'PRONTO — veja a tabela acima. JSON copiado para a área de transferência.';
})();
