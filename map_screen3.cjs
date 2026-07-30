const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  
  const buttons = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.outerHTML);
  });
  
  console.log(buttons.join('\n\n'));
  
  await browser.close();
})();
