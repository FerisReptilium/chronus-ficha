'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const BASE_URL = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.ChronusRouter));
    const toggle = page.locator('#btn-mobile-menu-toggle');
    const drawer = page.locator('#mobile-nav-drawer');
    const close = page.locator('#btn-mobile-menu-close');

    await toggle.click();
    await assertEventually(async () => {
      assert.strictEqual(await toggle.getAttribute('aria-expanded'), 'true');
      assert.strictEqual(await drawer.getAttribute('aria-hidden'), 'false');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'btn-mobile-menu-close');
    }, 'opening state and initial focus');

    await page.keyboard.press('Shift+Tab');
    const focusDiagnostic = {
      keydown: await drawer.getAttribute('data-focus-trap-diagnostic'),
      result: await drawer.getAttribute('data-focus-trap-result'),
      keyup: await drawer.getAttribute('data-focus-trap-keyup'),
      focusin: await drawer.getAttribute('data-focus-trap-focusin')
    };
    assert.strictEqual(await page.evaluate(() => document.activeElement?.textContent.trim()), '📚 Biblioteca', `Shift+Tab must wrap to the last navigation link; diagnostic=${JSON.stringify(focusDiagnostic)}`);
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'btn-mobile-menu-close', 'Tab must wrap to the first focusable control');

    await page.keyboard.press('Escape');
    assert.strictEqual(await toggle.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(await drawer.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'btn-mobile-menu-toggle', 'Escape must restore focus to the menu toggle');

    await toggle.click();
    await drawer.getByRole('link', { name: 'Crônica' }).click();
    await page.waitForFunction(() => location.hash === '#/chronicle' && document.querySelector('#btn-mobile-menu-toggle')?.getAttribute('aria-expanded') === 'false' && document.querySelector('#mobile-nav-drawer')?.getAttribute('aria-hidden') === 'true');
    assert.strictEqual(await toggle.getAttribute('aria-expanded'), 'false', 'Route navigation must close the drawer');
    assert.strictEqual(await drawer.getAttribute('aria-hidden'), 'true', 'Closed drawer must be hidden from assistive technology');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'btn-mobile-menu-toggle', 'Route navigation must restore focus to the toggle');

    console.log('PASS v1.5.4 mobile navigation: ARIA state, focus entry, Tab trap, Escape, route close and focus restoration');
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
