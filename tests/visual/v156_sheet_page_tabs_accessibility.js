'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const BASE_URL = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [mode, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.supabase={createClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null},error:null}),signOut:async()=>({error:null})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})}),storage:{from:()=>({})}})};' }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.route('https://fonts.gstatic.com/**', route => route.abort());
      await page.goto(`${BASE_URL}/#/sheet`, { waitUntil: 'domcontentloaded' });
      const tabs = page.getByRole('tablist', { name: 'Páginas da ficha' });
      const first = tabs.getByRole('tab', { name: 'Página I' });
      const second = tabs.getByRole('tab', { name: 'Página II' });
      const pageOne = page.locator('#page-1');
      const pageTwo = page.locator('#page-2');
      await first.waitFor({ state: 'visible' });
      await page.waitForFunction(() => Boolean(document.querySelector('#page-2 textarea[aria-label="Histórico do personagem"]')));
      assert.strictEqual(await first.getAttribute('aria-selected'), 'true', `${mode}: first tab must start selected`);
      assert.strictEqual(await second.getAttribute('aria-selected'), 'false', `${mode}: second tab must start unselected`);
      assert.strictEqual(await pageOne.getAttribute('aria-hidden'), 'false', `${mode}: active panel must be exposed`);
      assert.strictEqual(await pageTwo.getAttribute('aria-hidden'), 'true', `${mode}: inactive panel must be hidden`);
      assert.strictEqual(await pageTwo.evaluate(el => el.inert), true, `${mode}: inactive panel must be inert`);

      await first.focus();
      await page.keyboard.press('ArrowRight');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-2', `${mode}: ArrowRight must move focus`);
      assert.strictEqual(await second.getAttribute('aria-selected'), 'true', `${mode}: ArrowRight must activate second tab`);
      assert.strictEqual(await pageTwo.getAttribute('aria-hidden'), 'false', `${mode}: second panel must become accessible`);
      assert.strictEqual(await pageTwo.evaluate(el => el.inert), false, `${mode}: active panel must not be inert`);
      assert.strictEqual(await pageOne.evaluate(el => el.inert), true, `${mode}: previous panel must become inert`);

      await page.keyboard.press('ArrowLeft');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-1', `${mode}: ArrowLeft must return focus`);
      assert.strictEqual(await first.getAttribute('aria-selected'), 'true', `${mode}: ArrowLeft must activate first tab`);
      await page.keyboard.press('End');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-2', `${mode}: End must focus last tab`);
      await page.keyboard.press('Home');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-1', `${mode}: Home must focus first tab`);
      assert.strictEqual(await page.locator('#page-2 textarea').getAttribute('aria-label'), 'Histórico do personagem', `${mode}: history field must be named`);
      assert.deepStrictEqual(errors, [], `${mode}: browser runtime errors`);
      await context.close();
    }
    console.log('PASS v1.5.6 sheet page tabs accessibility: desktop/mobile ARIA, inert panels, arrow keys, Home/End');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
