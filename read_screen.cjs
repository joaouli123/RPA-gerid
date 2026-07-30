const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  console.log(await p.evaluate(() => document.body.innerText));
  const inputs = await p.evaluate(() => Array.from(document.querySelectorAll('a, button, [role="button"]')).map(el => el.tagName + ' | id: ' + el.id + ' | class: ' + el.className + ' | text: ' + el.innerText.substring(0, 30).replace(/\n/g, ' ')));
  console.log(inputs.join('\n'));
  await browser.close();
})();
