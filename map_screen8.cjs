const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  
  console.log('Anexando arquivos...');
  
  // Attach dummy.pdf to all file inputs
  const fileInputs = p.locator('input[type="file"]');
  const count = await fileInputs.count();
  
  for (let i = 0; i < count; i++) {
    await fileInputs.nth(i).setInputFiles(path.resolve('dummy.pdf')).catch(e => console.log('Falha ao anexar no input', i, e.message));
  }
  
  await p.waitForTimeout(1000);
  
  // click Avançar
  console.log('Avançando...');
  const btnNext = p.locator('#btn-next:visible').first();
  await btnNext.click({ force: true });
  await p.waitForTimeout(4000);
  
  const text = await p.evaluate(() => document.body.innerText).catch(e=>'');
  console.log('Texto na tela após tentar avançar:', text.replace(/\n/g, ' ').substring(0, 500));
  
  await browser.close();
})();
