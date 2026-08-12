// Cole no Console (F12) na tela do passo 4. Reproduz a SEQUÊNCIA exata do robô
// e fotografa os valores a cada etapa, para achar o que esvazia os campos.
// NÃO clica em Avançar.
(async () => {
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  const IDS = ['selectEstadoCivil0', 'selectParentesco0', 'selectEstadoCivil1'];
  const foto = (etiqueta) => {
    const o = { etapa: etiqueta };
    for (const id of IDS) o[id] = document.getElementById(id)?.value ?? '(sumiu)';
    const n = document.getElementById('undefined-Nao');
    const s = document.getElementById('undefined-Sim');
    o.Nao = n ? n.checked : '(sumiu)';
    o.Sim = s ? s.checked : '(sumiu)';
    return o;
  };
  const clicarReal = (el) => {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, composed: true, button: 0, view: window }));
    }
  };
  const selecionar = (id, alvo) => {
    const lista = document.getElementById(id + '-itens');
    const it = [...(lista?.querySelectorAll('.br-item') || [])].find(i =>
      (i.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().startsWith(alvo.toLowerCase()));
    if (!it) return 'item nao encontrado';
    clicarReal(it);
    return 'ok';
  };

  const linha = [foto('0 - inicio')];

  // Etapa A: preenche na MESMA ordem do robô (linha 0: estado civil, depois parentesco; linha 1: estado civil)
  selecionar('selectEstadoCivil0', 'Solteiro');
  await espera(300);
  selecionar('selectParentesco0', 'Outros');
  await espera(300);
  selecionar('selectEstadoCivil1', 'Solteiro');
  await espera(300);
  linha.push(foto('A - depois de preencher os 3'));

  // Etapa B: os valores sobrevivem sozinhos?
  await espera(1500);
  linha.push(foto('B - 1,5s parado'));

  // Etapa C: o input do "Nao" é "visivel" pelo criterio do robo?
  const nao = document.getElementById('undefined-Nao');
  const est = nao ? getComputedStyle(nao) : null;
  const visibilidadeDoNao = nao ? {
    getClientRects: nao.getClientRects().length,
    offsetWidth: nao.offsetWidth,
    offsetHeight: nao.offsetHeight,
    display: est.display,
    visibility: est.visibility,
    opacity: est.opacity,
    position: est.position,
    // este é exatamente o teste que o robô usa em visivel()
    passaNoTesteDoRobo: nao.getClientRects().length > 0,
  } : null;

  // Etapa D: marca o "Nao" clicando na tag (estratégia que funcionou na sonda anterior)
  const tag = nao?.closest('.interaction-select');
  if (tag) clicarReal(tag);
  await espera(600);
  linha.push(foto('D - depois de marcar Nao'));

  // Etapa E: assentou?
  await espera(1500);
  linha.push(foto('E - 1,5s depois do Nao'));

  const btn = document.getElementById('btn-next');
  const saida = {
    visibilidadeDoNao,
    botaoAvancar: btn ? { existe: true, disabled: btn.disabled, ariaDisabled: btn.getAttribute('aria-disabled') } : null,
    alertasNaTela: [...document.querySelectorAll('.br-message, [role="alert"], .feedback')]
      .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5),
    sequencia: linha,
  };
  console.table(linha);
  console.log(JSON.stringify(saida, null, 1));
  try { copy(JSON.stringify(saida)); } catch (e) {}
  return 'PRONTO — veja a tabela acima.';
})();
