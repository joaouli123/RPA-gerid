const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  
  console.log('Preenchendo paisesAcordo...');
  
  // Open the combobox first
  const combo = p.locator('#paisesAcordo');
  if (await combo.count() > 0) {
    await combo.click({ force: true });
    await p.waitForTimeout(500);
  }

  // Find the items container
  const itemsContainer = p.locator('#paisesAcordo-itens');
  if (await itemsContainer.count() > 0) {
    const radios = itemsContainer.locator('input[type=\"radio\"]');
    if (await radios.count() > 1) { // > 1 because 0 is usually "Limpar"
      // Find the label for the second radio
      const secondRadioId = await radios.nth(1).getAttribute('id');
      if (secondRadioId) {
        const label = itemsContainer.locator(`label[for="${secondRadioId}"]`);
        if (await label.count() > 0) {
          await label.click({ force: true });
        }
      }
    }
  }
  
  // click Avançar
  const btnNext = p.locator('#btn-next:visible').first();
  await btnNext.click({ force: true });
  await p.waitForTimeout(4000);
  
  const text = await p.evaluate(() => document.body.innerText).catch(e=>'');
  console.log('Texto na tela após tentar avançar:', text.replace(/\\n/g, ' ').substring(0, 500));
  
  await browser.close();
})();
