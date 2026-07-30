const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  
  console.log('Clicando em avançar...');
  const btnNext = p.locator('#btn-next:visible').first();
  await btnNext.click({ force: true });
  await p.waitForTimeout(4000);
  
  const text = await p.evaluate(() => document.body.innerText).catch(e=>'');
  console.log('Texto na tela:', text.replace(/\\n/g, ' ').substring(0, 500));
  
  const inputs = await p.evaluate(() => {
    const isVisible = (elem) => !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
    return Array.from(document.querySelectorAll('input, select, textarea, button, [role=\"combobox\"]'))
      .filter(isVisible)
      .map(el => {
        let label = '';
        try {
          if (el.id) {
            const l = document.querySelector('label[for=\"' + el.id + '\"]');
            if (l) label = l.innerText;
          }
        } catch(e){}
        return el.tagName + ' | id: ' + el.id + ' | type: ' + el.type + ' | class: ' + el.className + ' | label: ' + label;
      });
  });
  
  console.log('\nInputs VISIVEIS:\n' + inputs.filter(i => !i.includes('wizard-btn-prev')).join('\n'));
  
  await browser.close();
})();
