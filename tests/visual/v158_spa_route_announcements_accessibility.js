'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const BASE_URL = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.ChronusRouter));
    const announcer = page.locator('#route-announcer');
    const deepLinkContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const deepLinkPage = await deepLinkContext.newPage();
    await deepLinkPage.goto(`${BASE_URL}/#/sessions`, { waitUntil: 'domcontentloaded' });
    await deepLinkPage.waitForFunction(() => Boolean(window.ChronusRouter));
    await assertEventually(async () => {
      assert.strictEqual(await deepLinkPage.locator('#route-announcer').textContent(), '', 'A direct deep-link load must not be announced as an in-app route transition');
    }, 'silent initial deep-link render');
    await deepLinkContext.close();
    await assertEventually(async () => {
      assert.strictEqual(await announcer.getAttribute('role'), 'status');
      assert.strictEqual(await announcer.getAttribute('aria-live'), 'polite');
      assert.strictEqual(await announcer.textContent(), '', 'Initial render must not generate a false route-change announcement');
    }, 'initial live region');

    await page.getByRole('link', { name: 'Crônica' }).first().click();
    await page.waitForFunction(() => location.hash === '#/chronicle');
    await assertEventually(async () => {
      assert.strictEqual(await announcer.textContent(), 'Crônica · CHRONUS', 'Client-side navigation must announce the destination title');
      assert.strictEqual(await page.title(), 'Crônica · CHRONUS', 'The document title and live announcement must stay aligned');
    }, 'route announcement');

    await page.getByRole('link', { name: 'Sessões' }).first().click();
    await page.waitForFunction(() => location.hash === '#/sessions');
    await assertEventually(async () => {
      assert.strictEqual(await announcer.textContent(), 'Sessões · CHRONUS', 'Each subsequent route must announce its own title');
    }, 'second route announcement');

    console.log('PASS v1.5.8 SPA route announcements: initial state, polite live region, and successive client-side route changes');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

async function assertEventually(assertion, label, attempts = 20) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError?.message || 'unknown error'}`);
}
