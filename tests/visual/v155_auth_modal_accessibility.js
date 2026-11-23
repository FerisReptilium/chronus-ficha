'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const BASE_URL = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.ChronusAuth?.isInitialized?.()));
    const authGate = page.locator('#authGate');
    const authEmail = page.locator('#authEmail');
    const loginTrigger = page.locator('#btn-nav-login');

    await loginTrigger.click();
    await page.waitForFunction(() => document.activeElement?.id === 'authEmail');
    assert.strictEqual(await authGate.getAttribute('aria-hidden'), 'false');
    assert.strictEqual(await authGate.getAttribute('aria-modal'), 'true');

    await page.locator('#btn-close-auth-modal').focus();
    await page.keyboard.press('Shift+Tab');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'authForgotButton', 'Shift+Tab from the first control must wrap to the last control');
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'btn-close-auth-modal', 'Tab from the last control must wrap to the first control');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#authGate')?.hidden === true);
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'btn-nav-login', 'Closing auth dialog must restore focus to its opener');
    assert.strictEqual(await authGate.getAttribute('aria-hidden'), 'true');

    await page.evaluate(() => window.ChronusAuth.showPasswordModal('change'));
    await page.waitForFunction(() => document.activeElement?.id === 'newPassword');
    const passwordGate = page.locator('#passwordGate');
    assert.strictEqual(await passwordGate.getAttribute('aria-hidden'), 'false');
    await page.locator('#passwordCancelButton').focus();
    await page.keyboard.press('Shift+Tab');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'passwordSaveButton', 'Password dialog focus must wrap in reverse');
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'passwordCancelButton', 'Password dialog focus must wrap forward');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#passwordGate')?.hidden === true);
    console.log('PASS v1.5.5 auth/password dialogs: initial focus, focus trap, Escape, ARIA and focus restoration');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
