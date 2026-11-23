'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'css/narrator-panel-polish-v16.css'), 'utf8') });
    await page.evaluate(() => {
      const view = document.getElementById('view-narrator');
      view.classList.add('is-active');
      const root = document.getElementById('narrator-panel-container');
      root.innerHTML = `
        <div class="narrator-pane is-visible">
          <header class="narrator-shell-header"><div><h2 class="narrator-main-title">Cabala de Jogadores (Mesa Ativa)</h2><p class="narrator-subtitle-desc">Acompanhe o estado das fichas em tempo real.</p></div><button>Atualizar Mesa</button></header>
          <section class="narrator-narrative-guide"><h3>Autoridade narrativa — CHRONUS</h3><p>O Narrador nunca realiza rolagens.</p><p>Sucesso excepcional: o jogador descreve a cena.</p><p>Sucesso: o jogador descreve como alcança o objetivo.</p><p>Sucesso parcial: jogador e Narrador constroem a cena juntos.</p><p>Falha: o Narrador descreve o insucesso.</p></section>
          <section class="narrator-live-rolls"><div class="narrator-roll-feed-heading"><h3>Rolagens ao vivo</h3><span class="narrator-roll-feed-status">● Ao vivo</span></div><div class="narrator-roll-feed-list"><p class="narrator-roll-feed-empty">Nenhuma rolagem compartilhada nesta mesa ainda.</p></div></section>
          <div class="narrator-players-grid"><article class="narrator-player-card"><h3 class="player-name-title">Jogador de Teste</h3><p class="player-email-sub">teste@example.com</p></article><article class="narrator-player-card"><h3 class="player-name-title">Outro Jogador</h3></article></div>
        </div>`;
    });

    const desktop = await page.evaluate(() => {
      const guide = document.querySelector('.narrator-narrative-guide');
      const paragraph = guide.querySelector('p');
      const feed = document.querySelector('.narrator-live-rolls');
      const grid = document.querySelector('.narrator-players-grid');
      return {
        guideColor: getComputedStyle(paragraph).color,
        guideBackground: getComputedStyle(guide).backgroundColor,
        feedColor: getComputedStyle(feed).color,
        gridColumns: getComputedStyle(grid).gridTemplateColumns,
        guideHeight: guide.getBoundingClientRect().height
      };
    });
    assert.equal(desktop.guideColor, 'rgb(241, 223, 185)');
    assert.equal(desktop.feedColor, 'rgb(232, 220, 200)');
    assert.ok(desktop.guideHeight < 500, 'Narrative guide must not expand into a giant blank panel');
    assert.ok(desktop.gridColumns.split(' ').length >= 2, 'Desktop player cards should use multiple columns');
    await fs.promises.mkdir(path.join(root, 'artifacts/v160-narrator-panel'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/v160-narrator-panel/desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      guideColumns: getComputedStyle(document.querySelector('.narrator-narrative-guide')).gridTemplateColumns,
      playerColumns: getComputedStyle(document.querySelector('.narrator-players-grid')).gridTemplateColumns,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    assert.equal(mobile.guideColumns.split(' ').length, 1, 'Mobile narrative guide should stack into one column');
    assert.equal(mobile.playerColumns.split(' ').length, 1, 'Mobile player cards should stack into one column');
    assert.ok(mobile.bodyWidth <= mobile.viewportWidth, 'Narrator panel must not cause horizontal overflow');
    await page.screenshot({ path: path.join(root, 'artifacts/v160-narrator-panel/mobile.png'), fullPage: true });
    console.log('PASS v1.6.0 narrator panel desktop/mobile presentation:', JSON.stringify({ desktop, mobile }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
