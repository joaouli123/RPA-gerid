const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => x.url().includes('inss.gov.br'));
  const chk = p.locator('input[id="campo-declaracaoConfirmar"]').locator('visible=true');
  if (await chk.count() > 0) {
      await chk.first().check({force: true});
  }
  await p.locator('#btn-next').locator('visible=true').first().click();
  console.log('Confirmado!');
  await new Promise(r => setTimeout(r, 12000));
  console.log(await p.evaluate(() => document.body.innerText));
  const inputs = await p.evaluate(() => Array.from(document.querySelectorAll('a, button, [role="button"]')).map(el => el.tagName + ' | id: ' + el.id + ' | class: ' + el.className + ' | text: ' + el.innerText.substring(0, 30).replace(/\n/g, ' ')));
  console.log(inputs.join('\n'));
  await browser.close();
})();
