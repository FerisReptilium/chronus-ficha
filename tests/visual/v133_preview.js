'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const origin = process.env.CHRONUS_PREVIEW_ORIGIN || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.CHRONUS_PREVIEW_OUTPUT || 'artifacts/v133-preview');
const routes = ['chronicle','sessions','npcs','maps','files','soundtrack','system','library'];
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};

async function collectErrors(page) {
  const errors = { console: [], page: [] };
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', error => errors.page.push(error.message));
  return errors;
}

async function inspectRoute(browser, mode, viewport, route) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = await collectErrors(page);
  const response = await page.goto(`${origin}/#/${route}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.chronusPortal === 'v1.3.3-preview');
  await page.waitForSelector(`#view-${route}.portal-internal-v133 .section-head-editorial`, { state: 'visible' });
  await page.waitForTimeout(450);

  const state = await page.evaluate(routeName => {
    const view = document.getElementById(`view-${routeName}`);
    const head = view.querySelector('.section-head-editorial');
    const rect = head.getBoundingClientRect();
    return {
      marker: document.documentElement.dataset.chronusPortal,
      viewId: view.id,
      viewActive: view.classList.contains('is-active'),
      headerHeight: Math.round(rect.height),
      headerBackground: getComputedStyle(head).backgroundImage,
      stamp: head.dataset.v133Stamp,
      context: head.querySelector('.v133-hero-context')?.textContent.trim() || '',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      brokenImages: [...view.querySelectorAll('img[src]')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.getAttribute('src')),
      systemPrinciples: document.querySelectorAll('#view-system .system-v133-principles article').length
    };
  }, route);

  state.httpStatus = response?.status() || null;
  state.errors = errors;
  await page.screenshot({ path: path.join(outputDir, `${mode}-${route}-hero.png`) });

  if (route === 'system') {
    await page.screenshot({ path: path.join(outputDir, `${mode}-system-full.png`), fullPage: true });
  }
  await page.close();
  return state;
}

async function inspectHome(browser, mode, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = await collectErrors(page);
  const response = await page.goto(`${origin}/#/home`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('.v132-library-art .v132-library-volume', { state: 'visible' });
  await page.waitForTimeout(450);
  const state = await page.evaluate(() => ({
    marker: document.documentElement.dataset.chronusPortal,
    volumes: [...document.querySelectorAll('.v132-library-volume')].map(volume => ({
      title: volume.querySelector('strong')?.textContent.trim() || '',
      detail: volume.querySelector('small')?.textContent.trim() || ''
    })),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    brokenImages: [...document.querySelectorAll('#view-home img[src]')]
      .filter(image => !image.complete || image.naturalWidth === 0)
      .map(image => image.getAttribute('src'))
  }));
  state.httpStatus = response?.status() || null;
  state.errors = errors;
  await page.screenshot({ path: path.join(outputDir, `${mode}-home-full.png`), fullPage: true });
  await page.close();
  return state;
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const [mode, viewport] of Object.entries(viewports)) {
    results[mode] = { home: await inspectHome(browser, mode, viewport), routes: {} };
    for (const route of routes) {
      results[mode].routes[route] = await inspectRoute(browser, mode, viewport, route);
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'qa.json'), `${JSON.stringify(results, null, 2)}\n`);

  for (const [mode, result] of Object.entries(results)) {
    if (result.home.httpStatus !== 200 || result.home.marker !== 'v1.3.3-preview') throw new Error(`${mode}: Home v1.3.3 unavailable`);
    if (result.home.volumes.length !== 3) throw new Error(`${mode}: expected 3 editorial volumes`);
    if (result.home.horizontalOverflow || result.home.brokenImages.length) throw new Error(`${mode}: Home visual regression`);
    if (result.home.errors.console.length || result.home.errors.page.length) throw new Error(`${mode}: Home browser errors`);

    for (const [route, state] of Object.entries(result.routes)) {
      if (state.httpStatus !== 200 || state.marker !== 'v1.3.3-preview') throw new Error(`${mode}/${route}: preview unavailable`);
      if (!state.viewActive || state.viewId !== `view-${route}`) throw new Error(`${mode}/${route}: wrong active view`);
      if (state.headerHeight < 400 || !state.headerBackground.includes('.webp')) throw new Error(`${mode}/${route}: hero art missing`);
      if (!state.stamp || !state.context) throw new Error(`${mode}/${route}: editorial metadata missing`);
      if (state.horizontalOverflow || state.brokenImages.length) throw new Error(`${mode}/${route}: visual regression`);
      if (state.errors.console.length || state.errors.page.length) throw new Error(`${mode}/${route}: browser errors`);
      if (route === 'system' && state.systemPrinciples !== 3) throw new Error(`${mode}/system: principles missing`);
    }
  }

  console.log('v1.3.3 desktop/mobile visual QA: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
