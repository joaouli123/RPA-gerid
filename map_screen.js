const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`Página ${i}: ${p.url()} - ${await p.title().catch(e=>'err')}`);
    if (p.url().includes('inss.gov.br')) {
      const cpf = await p.locator('input[id=\"idRequerente.cpf\"]').first().inputValue().catch(e=>e.message);
      console.log('   -> CPF:', cpf);
      const text = await p.evaluate(() => document.body.innerText).catch(e=>'');
      console.log('   -> Texto:', text.replace(/\\n/g, ' ').substring(0, 100));
    }
  }
  await browser.close();
})();
