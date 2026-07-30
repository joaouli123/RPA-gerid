const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  
  console.log('Preenchendo campos dinâmicos...');
  
  // Fill all text inputs with "Teste"
  const textInputs = await p.locator('input[type=\"text\"]:visible').all();
  for (const input of textInputs) {
    const isReadonly = await input.getAttribute('readonly');
    const isDisabled = await input.getAttribute('disabled');
    if (isReadonly === null && isDisabled === null) {
      await input.fill('Teste').catch(() => {});
    }
  }
  
  // Check all checkboxes
  const checkboxes = await p.locator('input[type=\"checkbox\"]:visible').all();
  for (const cb of checkboxes) {
    await cb.check({ force: true }).catch(() => {});
  }
  
  // Select all comboboxes?
  // We can just try to click next again
  const btnNext = p.locator('#btn-next:visible').first();
  await btnNext.click({ force: true });
  await p.waitForTimeout(4000);
  
  const text = await p.evaluate(() => document.body.innerText).catch(e=>'');
  console.log('Texto na tela após tentar avançar:', text.replace(/\\n/g, ' ').substring(0, 500));
  
  await browser.close();
})();
