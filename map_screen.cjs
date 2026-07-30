const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('inss.gov.br'));
  const text = await page.evaluate(() => document.body.innerText);
  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea, button, [role=\"combobox\"]')).map(el => {
    let label = '';
    try {
      if (el.id) {
        const l = document.querySelector('label[for=\"' + el.id + '\"]');
        if (l) label = l.innerText;
      }
    } catch(e){}
    return el.tagName + ' | id: ' + el.id + ' | type: ' + el.type + ' | class: ' + el.className + ' | label: ' + label;
  }));
  console.log('Texto completo:\n', text);
  console.log('\nInputs na tela:\n', inputs.join('\n'));
  await browser.close();
})();
