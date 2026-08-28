'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseUrl = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173/#/home';
const outputDir = path.resolve(process.env.CHRONUS_PREVIEW_OUTPUT || 'artifacts/v132-preview');

async function inspectPage(page, name) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.home-v132', { state: 'visible', timeout: 10000 });

  const state = await page.evaluate(() => ({
    marker: document.documentElement.dataset.chronusHome,
    title: document.title,
    textLength: document.body.innerText.trim().length,
    sections: document.querySelectorAll('.home-v132 > section').length,
    legacyScenes: document.querySelectorAll('.chronicle-scene-v13,.sessions-scene-v13,.npcs-scene-v13,.locations-scene-v13,.files-scene-v13,.library-scene-v13').length,
    oldEditorialVisible: [...document.querySelectorAll('#view-home > .editorial-section')]
      .some(section => getComputedStyle(section).display !== 'none'),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    pageHeight: document.documentElement.scrollHeight,
    hero: (() => {
      const rect = document.querySelector('.hero-v132').getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    })(),
    visibleNavigation: [...document.querySelectorAll('.nav-links-desktop .nav-link')]
      .filter(link => getComputedStyle(link.closest('li')).display !== 'none')
      .map(link => link.textContent.trim()),
    missingAlt: [...document.querySelectorAll('.home-v132 img')].filter(image => !image.alt).length,
    brokenImages: [...document.querySelectorAll('.home-v132 img')]
      .filter(image => !image.complete || image.naturalWidth === 0)
      .map(image => image.getAttribute('src')),
    images: [...document.querySelectorAll('.home-v132 img')].map(image => {
      const rect = image.getBoundingClientRect();
      return {
        src: image.getAttribute('src'),
        natural: [image.naturalWidth, image.naturalHeight],
        rendered: [Math.round(rect.width), Math.round(rect.height)]
      };
    })
  }));

  state.httpStatus = response?.status() || null;
  state.consoleErrors = consoleErrors;
  state.pageErrors = pageErrors;

  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  return state;
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000 },
    mobile: { width: 390, height: 844 }
  })) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    results[name] = await inspectPage(page, name);
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'qa.json'), `${JSON.stringify(results, null, 2)}\n`);

  for (const [name, result] of Object.entries(results)) {
    if (result.httpStatus !== 200) throw new Error(`${name}: unexpected HTTP status ${result.httpStatus}`);
    if (result.marker !== 'v1.3.2-wireframe') throw new Error(`${name}: v1.3.2 readiness marker missing`);
    if (result.sections !== 5) throw new Error(`${name}: expected 5 editorial sections, found ${result.sections}`);
    if (result.legacyScenes !== 0 || result.oldEditorialVisible) throw new Error(`${name}: legacy Home remains visible`);
    if (result.horizontalOverflow) throw new Error(`${name}: horizontal overflow detected`);
    if (result.brokenImages.length) throw new Error(`${name}: broken images: ${result.brokenImages.join(', ')}`);
    if (result.missingAlt) throw new Error(`${name}: ${result.missingAlt} images without alt text`);
    if (result.consoleErrors.length || result.pageErrors.length) {
      throw new Error(`${name}: browser errors detected: ${[...result.consoleErrors, ...result.pageErrors].join(' | ')}`);
    }
  }

  console.log('v1.3.2 visual preview QA: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
