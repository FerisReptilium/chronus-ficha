'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseUrl = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve('artifacts/v134-preview');
fs.mkdirSync(outputDir, { recursive: true });

async function installYoutubeMock(page) {
  await page.addInitScript(() => {
    class MockYoutubePlayer {
      constructor(hostId, config) {
        this.hostId = hostId;
        this.config = config;
        this.state = -1;
        this.muted = false;
        this.volume = 0;
        window.__chronusYoutubeMock = this;
        setTimeout(() => config.events.onReady({ target: this }), 0);
      }
      setVolume(value) { this.volume = value; }
      unMute() { this.muted = false; }
      mute() { this.muted = true; }
      isMuted() { return this.muted; }
      getPlayerState() { return this.state; }
      playVideo() {
        this.state = 1;
        this.config.events.onStateChange({ data: 1, target: this });
      }
      pauseVideo() {
        this.state = 2;
        this.config.events.onStateChange({ data: 2, target: this });
      }
    }
    window.YT = {
      Player: MockYoutubePlayer,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 }
    };
  });
}

async function inspect(page) {
  return page.evaluate(() => {
    const dock = document.getElementById('chronus-audio-dock');
    const toggle = document.getElementById('chronus-audio-toggle');
    return {
      marker: document.documentElement.dataset.chronusAudio || null,
      portalMarker: document.documentElement.dataset.chronusPortal || null,
      dockState: dock?.dataset.state || null,
      fixed: dock ? getComputedStyle(dock).position === 'fixed' : false,
      toggleLabel: toggle?.getAttribute('aria-label') || '',
      pressed: toggle?.getAttribute('aria-pressed') || '',
      track: dock?.querySelector('.chronus-audio-copy strong')?.textContent.trim() || '',
      source: dock?.querySelector('.chronus-audio-source')?.href || '',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      preference: localStorage.getItem('chronus.ambientAudio.enabled.v1')
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const mode of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } }
  ]) {
    const context = await browser.newContext({ viewport: mode.viewport });
    const page = await context.newPage();
    const errors = { console: [], page: [] };
    page.on('console', message => {
      if (message.type() === 'error') errors.console.push(message.text());
    });
    page.on('pageerror', error => errors.page.push(error.message));
    await installYoutubeMock(page);

    const response = await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#chronus-audio-dock', { state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#chronus-audio-dock')?.dataset.state === 'on');

    const before = await inspect(page);
    await page.screenshot({ path: path.join(outputDir, `${mode.name}-audio-on.png`), fullPage: false });

    await page.click('#chronus-audio-toggle');
    await page.waitForFunction(() => document.querySelector('#chronus-audio-dock')?.dataset.state === 'off');
    const off = await inspect(page);

    await page.click('#chronus-audio-toggle');
    await page.waitForFunction(() => document.querySelector('#chronus-audio-dock')?.dataset.state === 'on');
    const restored = await inspect(page);

    results[mode.name] = {
      httpStatus: response?.status() || null,
      before,
      off,
      restored,
      errors
    };

    if (before.marker !== 'v1.3.4-preview') throw new Error(`${mode.name}: audio marker missing`);
    if (before.portalMarker !== 'v1.3.3-preview') throw new Error(`${mode.name}: portal v1.3.3 regression`);
    if (before.dockState !== 'on' || before.pressed !== 'true') throw new Error(`${mode.name}: audio did not start`);
    if (off.dockState !== 'off' || off.preference !== 'off') throw new Error(`${mode.name}: off state did not persist`);
    if (restored.dockState !== 'on' || restored.preference !== 'on') throw new Error(`${mode.name}: on state did not restore`);
    if (before.track !== 'Goodbye · Dark') throw new Error(`${mode.name}: track label mismatch`);
    if (!before.source.includes('hytkruP8wJk')) throw new Error(`${mode.name}: source link mismatch`);
    if (before.horizontalOverflow || restored.horizontalOverflow) throw new Error(`${mode.name}: horizontal overflow`);
    if (errors.console.length || errors.page.length) throw new Error(`${mode.name}: browser errors detected`);

    await context.close();
  }

  fs.writeFileSync(path.join(outputDir, 'qa.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('v1.3.4 ambient audio visual QA: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
