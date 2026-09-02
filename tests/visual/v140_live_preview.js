'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const origin = process.env.CHRONUS_PREVIEW_ORIGIN || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.CHRONUS_PREVIEW_OUTPUT || 'artifacts/v140-live-preview');
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};

function watchErrors(page) {
  const errors = { console: [], page: [] };
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', error => errors.page.push(error.message));
  return errors;
}

async function inspect(page) {
  return page.evaluate(() => {
    const root = document.getElementById('chronus-live-root');
    const localCard = document.querySelector('[data-participant-id="local"]');
    const viewportWidth = document.documentElement.clientWidth;
    const boxSelectors = [
      '.chronus-live-room',
      '.chronus-live-stage-column',
      '.chronus-live-stage',
      '.chronus-live-controls',
      '.chronus-live-sidebar'
    ];
    const boxesOutsideViewport = boxSelectors.flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > viewportWidth + 1 || box.width > viewportWidth + 1;
      })
      .map(element => element.className);
    const controls = document.querySelector('.chronus-live-controls')?.getBoundingClientRect();
    const controlsOutsideBar = controls
      ? [...document.querySelectorAll('.chronus-live-control')]
          .filter(button => {
            const box = button.getBoundingClientRect();
            return box.left < controls.left - 1 || box.right > controls.right + 1;
          })
          .map(button => button.id)
      : ['controls-missing'];
    const clippedText = [...document.querySelectorAll('.chronus-live-objective p, .chronus-live-objective h2, .chronus-live-identity strong')]
      .filter(element => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).textOverflow !== 'ellipsis')
      .map(element => element.textContent.trim());
    const overlayVisible = selector => {
      const element = document.querySelector(selector);
      return Boolean(element && getComputedStyle(element).display !== 'none');
    };
    const desktopLiveLink = [...document.querySelectorAll('.nav-links-desktop a[href="#/live"]')][0];
    const desktopLiveLinkBox = desktopLiveLink?.getBoundingClientRect();
    return {
      marker: document.documentElement.dataset.chronusLive || null,
      localPreview: document.documentElement.dataset.chronusLiveLocalPreview || null,
      active: document.getElementById('view-live')?.classList.contains('is-active') || false,
      participants: document.querySelectorAll('.chronus-live-participant').length,
      portraitFallbacks: document.querySelectorAll('.chronus-live-participant .chronus-live-media.is-camera-off').length,
      emptyPortraits: document.querySelectorAll('.chronus-live-participant .chronus-live-media.is-media-empty').length,
      localMediaState: localCard?.querySelector('.chronus-live-media')?.dataset.mediaState || null,
      stageMediaState: document.querySelector('#chronus-live-stage .chronus-live-media')?.dataset.mediaState || null,
      stageCharacter: document.querySelector('#chronus-live-stage .chronus-live-identity strong')?.textContent.trim() || '',
      screenShare: document.getElementById('chronus-live-stage')?.classList.contains('is-screen-share') || false,
      grid: document.getElementById('chronus-live-roster')?.classList.contains('is-grid') || false,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      boxesOutsideViewport,
      controlsOutsideBar,
      clippedText,
      globalOverlaysVisible: {
        dice: overlayVisible('#chronus-dice-launcher'),
        audio: overlayVisible('#chronus-audio-dock')
      },
      desktopLiveNavigationVisible: Boolean(desktopLiveLinkBox && desktopLiveLinkBox.width > 0 && desktopLiveLinkBox.height > 0),
      brokenImages: [...root.querySelectorAll('img[src]')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.getAttribute('src')),
      mediaDevicesRequested: Boolean(window.__chronusMediaDevicesRequested)
    };
  });
}

async function runMode(browser, mode, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    window.__chronusMediaDevicesRequested = false;
    if (navigator.mediaDevices?.getUserMedia) {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...args) => {
        window.__chronusMediaDevicesRequested = true;
        return original(...args);
      };
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // O preview deve ser determinístico e não depender da disponibilidade de
  // Supabase, YouTube ou qualquer outra rede externa durante o CI.
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = {
      createClient: () => ({
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getSession: async () => ({ data: { session: null }, error: null })
        }
      })
    };`
  }));
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: ''
  }));

  const errors = watchErrors(page);
  const response = await page.goto(`${origin}/#/live?preview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.chronus-live-room', { state: 'visible' });
  await page.waitForFunction(() => document.documentElement.dataset.chronusLive === 'v1.4.0-prototype');

  const initial = await inspect(page);
  await page.screenshot({ path: path.join(outputDir, `${mode}-room.png`), fullPage: true });

  await page.click('[data-participant-id="local"]');
  await page.waitForFunction(() => document.querySelector('#chronus-live-stage .chronus-live-identity strong')?.textContent.includes('Desperto 01'));
  const portrait = await inspect(page);
  await page.screenshot({ path: path.join(outputDir, `${mode}-empty-portrait.png`), fullPage: false });

  await page.click('#chronus-live-camera');
  await page.waitForFunction(() => document.querySelector('[data-participant-id="local"] .chronus-live-media')?.dataset.mediaState === 'camera');
  const cameraOn = await inspect(page);
  await page.screenshot({ path: path.join(outputDir, `${mode}-camera-on.png`), fullPage: false });

  await page.click('#chronus-live-camera');
  await page.waitForFunction(() => document.querySelector('[data-participant-id="local"] .chronus-live-media')?.dataset.mediaState === 'empty');
  const cameraOff = await inspect(page);

  await page.click('#chronus-live-share');
  await page.waitForSelector('.chronus-live-shared-file', { state: 'visible' });
  const screenShare = await inspect(page);
  await page.screenshot({ path: path.join(outputDir, `${mode}-screen-share.png`), fullPage: false });

  await page.click('#chronus-live-grid');
  const grid = await inspect(page);

  const result = {
    httpStatus: response?.status() || null,
    initial,
    portrait,
    cameraOn,
    cameraOff,
    screenShare,
    grid,
    errors
  };

  if (result.httpStatus !== 200) throw new Error(`${mode}: preview HTTP ${result.httpStatus}`);
  if (initial.marker !== 'v1.4.0-prototype' || initial.localPreview !== 'true') throw new Error(`${mode}: preview marker missing`);
  if (!initial.active || initial.participants !== 5) throw new Error(`${mode}: room or participants missing`);
  if (initial.portraitFallbacks < 3) throw new Error(`${mode}: portrait fallbacks missing`);
  if (initial.emptyPortraits !== 5) throw new Error(`${mode}: participants without sheet photos must remain empty`);
  if (initial.horizontalOverflow || initial.brokenImages.length) throw new Error(`${mode}: initial visual regression`);
  if (initial.boxesOutsideViewport.length || initial.controlsOutsideBar.length || initial.clippedText.length) throw new Error(`${mode}: initial content clipping`);
  if (initial.globalOverlaysVisible.dice || initial.globalOverlaysVisible.audio) throw new Error(`${mode}: global dock overlaps live room`);
  if (mode === 'desktop' && !initial.desktopLiveNavigationVisible) throw new Error('desktop: CHRONUS LIVE navigation link is hidden');
  if (initial.mediaDevicesRequested) throw new Error(`${mode}: prototype requested real media`);
  if (portrait.stageMediaState !== 'empty' || portrait.stageCharacter !== 'Desperto 01') throw new Error(`${mode}: empty portrait spotlight failed`);
  if (cameraOn.localMediaState !== 'camera' || cameraOn.stageMediaState !== 'camera') throw new Error(`${mode}: camera-on simulation failed`);
  if (cameraOff.localMediaState !== 'empty' || cameraOff.stageMediaState !== 'empty') throw new Error(`${mode}: camera-off empty state failed`);
  if (!screenShare.screenShare) throw new Error(`${mode}: screen-share prototype failed`);
  if (!grid.grid) throw new Error(`${mode}: grid layout failed`);
  if (cameraOn.horizontalOverflow || cameraOff.horizontalOverflow || screenShare.horizontalOverflow || grid.horizontalOverflow) throw new Error(`${mode}: interaction caused horizontal overflow`);
  for (const [stateName, state] of Object.entries({ portrait, cameraOn, cameraOff, screenShare, grid })) {
    if (state.boxesOutsideViewport.length || state.controlsOutsideBar.length || state.clippedText.length) throw new Error(`${mode}: ${stateName} content clipping`);
  }
  if (errors.console.length || errors.page.length) throw new Error(`${mode}: browser errors detected`);

  await context.close();
  return result;
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const [mode, viewport] of Object.entries(viewports)) {
    results[mode] = await runMode(browser, mode, viewport);
  }

  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'qa.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log('v1.4.0 CHRONUS LIVE desktop/mobile visual QA: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
