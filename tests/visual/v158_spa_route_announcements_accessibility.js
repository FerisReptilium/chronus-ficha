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
    await page.waitForFunction(() => Boolean(window.ChronusRouter) && !document.getElementById('chronus-boot-screen'));
    const announcer = page.locator('#route-announcer');

    const deepLinkContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const deepLinkPage = await deepLinkContext.newPage();
    await deepLinkPage.goto(`${BASE_URL}/#/sessions`, { waitUntil: 'domcontentloaded' });
    await deepLinkPage.waitForFunction(() => Boolean(window.ChronusRouter) && !document.getElementById('chronus-boot-screen'));
    assert.strictEqual(await deepLinkPage.locator('#route-announcer').textContent(), '', 'A direct deep-link load must not be announced as an in-app transition');
    await deepLinkContext.close();

    assert.strictEqual(await announcer.getAttribute('role'), 'status');
    assert.strictEqual(await announcer.getAttribute('aria-live'), 'polite');
    assert.strictEqual(await announcer.textContent(), '', 'Initial render must not generate a false route-change announcement');

    await page.locator('a[href="#/chronicle"]:visible').first().click();
    await page.waitForFunction(() => location.hash === '#/chronicle');
    await page.waitForFunction(() => document.getElementById('route-announcer')?.textContent === 'Crônica · CHRONUS');
    assert.strictEqual(await page.title(), 'Crônica · CHRONUS', 'The document title and live announcement must stay aligned');

    await page.evaluate(() => window.ChronusRouter.navigateTo('#/sessions'));
    await page.waitForFunction(() => location.hash === '#/sessions');
    await page.waitForFunction(() => document.getElementById('route-announcer')?.textContent === 'Sessões · CHRONUS');

    console.log('PASS SPA route announcements: silent initial/deep-link render and successive client-side route changes');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
