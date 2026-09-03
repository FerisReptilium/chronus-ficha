'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const origin = process.env.CHRONUS_PREVIEW_ORIGIN || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.CHRONUS_PLAYER_PREVIEW_OUTPUT || 'artifacts/v143-player-dashboard');
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};

const supabaseMock = `
(() => {
  const ids = {
    user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    active: '11111111-1111-4111-8111-111111111111',
    next: '22222222-2222-4222-8222-222222222222',
    last: '33333333-3333-4333-8333-333333333333'
  };

  const records = {
    profiles: [{ id: ids.user, display_name: 'Felipe Ribeiro', email: 'felipe@example.com', role: 'player' }],
    characters: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      user_id: ids.user,
      name: 'Mara',
      updated_at: '2026-09-02T22:15:00Z',
      data: { identity: {
        name: 'Mara <img data-xss src=x onerror=alert(1)>',
        player: 'Felipe Ribeiro',
        tradition: 'Ordem de Hermes',
        concept: 'Investigadora do impossível',
        profession: 'Criptógrafa',
        chronicle: 'CHRONUS · Berlim 1990'
      } }
    }],
    campaign_sessions: [
      { id: ids.next, session_number: 5, title: 'A Caixa de KASSANDRA', slug: 'caixa-kassandra', session_date: '2026-09-09', in_game_date: '17 de setembro de 1990', summary: '', current_objective: 'Recuperar a caixa.', status: 'planned', sort_order: 5 },
      { id: ids.last, session_number: 3, title: 'O Arquivo Cinza', slug: 'arquivo-cinza', session_date: '2026-08-26', in_game_date: '12 de setembro de 1990', summary: 'A cabala decifrou o primeiro registro da K-17 e identificou um sinal vindo de Teufelsberg.', current_objective: null, status: 'completed', sort_order: 3 },
      { id: ids.active, session_number: 4, title: 'Sinal de Teufelsberg', slug: 'sinal-teufelsberg', session_date: '2026-09-02', in_game_date: '14 de setembro de 1990', summary: '', current_objective: 'Localizar a origem da transmissão <img data-xss src=x onerror=alert(2)> antes da meia-noite.', status: 'in_progress', sort_order: 4 }
    ],
    session_npcs: [{ role_in_session: 'Contato <script data-xss>alert(3)</script>', npc: { id: 'n1', name: 'Viktor Kane', slug: 'viktor-kane', role_occupation: 'Antiquário', status: 'alive' } }],
    session_locations: [{ notes: 'Origem provável do sinal', location: { id: 'l1', name: 'Teufelsberg', slug: 'teufelsberg', type: 'facility', district_region: 'Charlottenburg' } }],
    session_documents: [{ discovery_context: 'Interceptada pela K-17', document: { id: 'd1', title: 'Fita Magnética 17-B', slug: 'fita-17-b', type: 'audio_log' } }]
  };

  function createQuery(table) {
    const state = { filters: {}, statuses: null, limit: null };
    const result = () => {
      let data = [...(records[table] || [])];
      for (const [column, value] of Object.entries(state.filters)) {
        data = data.filter(row => row[column] === value || table.startsWith('session_'));
      }
      if (state.statuses) data = data.filter(row => state.statuses.includes(row.status));
      if (state.limit) data = data.slice(0, state.limit);
      return { data, error: null };
    };

    const query = {
      select() { return query; },
      eq(column, value) { state.filters[column] = value; return query; },
      in(column, values) { if (column === 'status') state.statuses = values; return query; },
      order() { return query; },
      limit(value) { state.limit = value; return query; },
      single: async () => ({ data: result().data[0] || null, error: null }),
      maybeSingle: async () => ({ data: result().data[0] || null, error: null }),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
    };
    return query;
  }

  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user: { id: ids.user, email: 'felipe@example.com' } } }, error: null }),
      signOut: async () => ({ error: null })
    },
    storage: {
      from: () => ({ download: async () => ({ data: null, error: { message: 'preview without portrait' } }) })
    },
    from: table => createQuery(table)
  };

  window.supabase = { createClient: () => client };
})();
`;

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
    const root = document.getElementById('player-dashboard-content');
    const viewportWidth = document.documentElement.clientWidth;
    const monitored = [
      '.character-hero-card',
      '.dashboard-briefing',
      '.briefing-card',
      '.dashboard-related',
      '.dashboard-related-group',
      '.dashboard-quick-links'
    ];
    const boxesOutsideViewport = monitored.flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > viewportWidth + 1 || box.width > viewportWidth + 1;
      })
      .map(element => element.className);
    const visibleRects = selector => [...document.querySelectorAll(selector)]
      .filter(element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(element => ({ element, rect: element.getBoundingClientRect() }));
    const contentRects = visibleRects([
      '.character-cta-row a',
      '.character-cta-row button',
      '.card-link',
      '.dashboard-related-list a',
      '.dashboard-quick-links a'
    ].join(', '));
    const fixedOverlayCollisions = visibleRects('.chronus-dice-launcher, .chronus-audio-dock')
      .flatMap(overlay => contentRects
        .filter(content => (
          overlay.rect.left < content.rect.right &&
          overlay.rect.right > content.rect.left &&
          overlay.rect.top < content.rect.bottom &&
          overlay.rect.bottom > content.rect.top
        ))
        .map(content => `${overlay.element.className} -> ${content.element.className}`));

    return {
      marker: document.documentElement.dataset.chronusPlayerDashboard || null,
      active: document.getElementById('view-player')?.classList.contains('is-active') || false,
      characterName: document.getElementById('dashboard-character-name')?.textContent || '',
      activeTitle: document.getElementById('dashboard-active-title')?.textContent || '',
      objective: document.getElementById('dashboard-current-objective')?.textContent || '',
      nextTitle: document.getElementById('dashboard-next-title')?.textContent || '',
      nextDate: document.getElementById('dashboard-next-date')?.textContent || '',
      lastTitle: document.getElementById('dashboard-last-title')?.textContent || '',
      lastSummary: document.getElementById('dashboard-last-summary')?.textContent || '',
      relatedSession: document.getElementById('dashboard-related-session')?.textContent || '',
      relationGroups: document.querySelectorAll('.dashboard-related-group').length,
      relationLinks: document.querySelectorAll('.dashboard-related-list a').length,
      quickLinks: document.querySelectorAll('.dashboard-quick-links a').length,
      xssElements: root.querySelectorAll('[data-xss], script, [onerror]').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      boxesOutsideViewport,
      fixedOverlayCollisions,
      brokenImages: [...root.querySelectorAll('img[src]')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.getAttribute('src'))
    };
  });
}

async function runMode(browser, mode, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: supabaseMock
  }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: ''
  }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: ''
  }));

  const errors = watchErrors(page);
  const response = await page.goto(`${origin}/#/player`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.chronusPlayerDashboard === 'v1.4.3');
  await page.waitForSelector('.dashboard-related-group', { state: 'visible' });

  const state = await inspect(page);
  await page.screenshot({ path: path.join(outputDir, `${mode}-player-dashboard.png`), fullPage: true });

  if (response?.status() !== 200) throw new Error(`${mode}: preview HTTP ${response?.status()}`);
  if (state.marker !== 'v1.4.3' || !state.active) throw new Error(`${mode}: dashboard readiness marker missing`);
  if (!state.characterName.includes('Mara <img')) throw new Error(`${mode}: character data missing`);
  if (state.activeTitle !== 'Sinal de Teufelsberg') throw new Error(`${mode}: active mission selection failed`);
  if (!state.objective.includes('Localizar a origem da transmissão <img')) throw new Error(`${mode}: current objective missing`);
  if (!state.nextTitle.includes('Sessão #5')) throw new Error(`${mode}: next session selection failed`);
  if (!state.nextDate.includes('09 de setembro de 2026')) throw new Error(`${mode}: next session date formatting failed`);
  if (!state.lastTitle.includes('Sessão #3') || !state.lastSummary.includes('primeiro registro da K-17')) throw new Error(`${mode}: previous summary missing`);
  if (state.relatedSession !== 'Sessão #4') throw new Error(`${mode}: related session context failed`);
  if (state.relationGroups !== 3 || state.relationLinks !== 3 || state.quickLinks !== 4) throw new Error(`${mode}: briefing relations or navigation incomplete`);
  if (state.xssElements !== 0) throw new Error(`${mode}: stored text created executable DOM`);
  if (state.horizontalOverflow || state.boxesOutsideViewport.length) throw new Error(`${mode}: horizontal layout regression`);
  if (state.fixedOverlayCollisions.length) throw new Error(`${mode}: global controls overlap dashboard content: ${state.fixedOverlayCollisions.join(', ')}`);
  if (state.brokenImages.length) throw new Error(`${mode}: broken dashboard images`);
  if (errors.console.length || errors.page.length) throw new Error(`${mode}: browser errors detected: ${JSON.stringify(errors)}`);

  await context.close();
  return { httpStatus: response?.status() || null, state, errors };
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const launchOptions = { headless: true };
  if (process.env.CHRONUS_CHROMIUM_EXECUTABLE) {
    launchOptions.executablePath = process.env.CHRONUS_CHROMIUM_EXECUTABLE;
  }
  const browser = await chromium.launch(launchOptions);
  const results = {};

  for (const [mode, viewport] of Object.entries(viewports)) {
    results[mode] = await runMode(browser, mode, viewport);
  }

  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'qa.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log('v1.4.3 player dashboard desktop/mobile visual QA: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
