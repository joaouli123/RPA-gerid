const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  
  console.log('Preenchendo perguntas dinâmicas...');
  
  // Preenche CPF do Procurador
  const cpfProc = p.getByLabel(/CPF do Procurador/i).first();
  if (await cpfProc.count() > 0) {
    await cpfProc.focus();
    await cpfProc.fill('');
    await cpfProc.pressSequentially('00000000000', { delay: 100 });
    await cpfProc.evaluate(el => el.blur());
  }

  // Marca todos os checkboxes de ciência
  const ciencias = p.locator('input[type="checkbox"][id^="campo-"]');
  const totalCiencias = await ciencias.count();
  for (let i = 0; i < totalCiencias; i++) {
    await ciencias.nth(i).check({ force: true });
  }

  // Encontra todos os comboboxes abertos (ca-*)
  const combos = p.locator('input[id^="ca-"]');
  const count = await combos.count();
  
  for (let i = 0; i < count; i++) {
    const id = await combos.nth(i).getAttribute('id');
    if (!id || id.endsWith('-itens')) continue;
    
    // Abre o combobox
    const combo = p.locator(`[id="${id}"]`);
    if (await combo.count() > 0) {
      await combo.scrollIntoViewIfNeeded();
      await combo.click({ force: true });
      await p.waitForTimeout(500);
      
      const itemsContainer = p.locator(`[id="${id}-itens"]`);
      const radios = itemsContainer.locator('input[type="radio"]');
      
      if (await radios.count() > 1) {
        // Tenta achar "Não", ou "B) Não", ou "O procurador do titular"
        let clicked = false;
        const numRadios = await radios.count();
        for (let j = 0; j < numRadios; j++) {
           const rId = await radios.nth(j).getAttribute('id');
           if (rId && (rId.includes('Não') || rId.includes('Nao') || rId === 'O procurador do titular' || rId === 'C) Não')) {
              const label = itemsContainer.locator(`label[for="${rId}"]`);
              if (await label.count() > 0) {
                 await label.click({ force: true });
                 clicked = true;
                 break;
              }
           }
        }
        
        // Se não achou, clica no segundo rádio por padrão (o índice 0 é 'Limpar')
        if (!clicked) {
           const secondId = await radios.nth(1).getAttribute('id');
           if (secondId) {
             const label = itemsContainer.locator(`label[for="${secondId}"]`);
             if (await label.count() > 0) await label.click({ force: true });
           }
        }
      }
    }
  }
  
  // click Avançar
  const btnNext = p.locator('#btn-next:visible').first();
  await btnNext.click({ force: true });
  await p.waitForTimeout(4000);
  
  const text = await p.evaluate(() => document.body.innerText).catch(e=>'');
  console.log('Texto na tela após tentar avançar:', text.replace(/\n/g, ' ').substring(0, 500));
  
  await browser.close();
})();
