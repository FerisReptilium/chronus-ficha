'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const BASE_URL = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';
const supabaseMock = `
(() => {
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'felipe@example.com' };
  const profile = { id: user.id, display_name: 'Felipe Ribeiro', email: user.email, role: 'player' };
  const character = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: user.id,
    name: 'Mara',
    updated_at: '2026-09-04T18:00:00Z',
    data: {
      identity: { name: 'Mara', player: 'Felipe Ribeiro', tradition: 'Ordem de Hermes', concept: 'Investigadora', profession: 'Criptógrafa', chronicle: 'CHRONUS' },
      personalities: ['Analítica <img data-xss src=x onerror=alert(1)>', 'Obstinada'],
      attributes: { 'Força': 'd6', 'Vigor': 'd6', 'Destreza': 'd8', 'Razão': 'd10', 'Astúcia': 'd8', 'Perseverança': 'd8', 'Manipulação': 'd4', 'Presença': 'd6', 'Vontade': 'd8' },
      illumination: 'd4', protection: '', pain: false, conditions: '', equipmentImportant: '', xp: { current: '', spent: '' },
      markers: { 'determination.0': 'filled', 'determination.1': 'filled', 'determination.2': 'empty' },
      paradox: 8,
      lists: {
        skills: [{ marker: 'filled', text: 'Investigação <script data-xss>alert(2)</script>' }, { marker: 'empty', text: 'Ocultismo' }],
        advantages: [], equipment: [], formulas: [], arcana: {}
      },
      page2: { formulas: [], inventory: [], history: '' }, activePage: 'page-1'
    }
  };

  function queryFor(table) {
    let updatePayload = null;
    const result = () => table === 'profiles' ? profile : table === 'characters' ? character : null;
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      update(payload) { updatePayload = payload; return query; },
      insert() { return query; },
      maybeSingle: async () => ({ data: result(), error: null }),
      single: async () => {
        if (updatePayload?.data) character.data = updatePayload.data;
        return { data: updatePayload ? { updated_at: new Date().toISOString() } : result(), error: null };
      },
      then(resolve, reject) { return Promise.resolve({ data: result() ? [result()] : [], error: null }).then(resolve, reject); }
    };
    return query;
  }

  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      signOut: async () => ({ error: null })
    },
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'preview without portrait' } }) }) },
    from: table => queryFor(table)
  };
  window.supabase = { createClient: () => client };
})();
`;

const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [mode, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(15000);
      await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseMock }));
      await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.route('https://fonts.gstatic.com/**', route => route.abort());
      await page.goto(`${BASE_URL}/#/sheet`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.chronusDice === 'v1.3.5-preview');
      await page.waitForFunction(() => window.ChronusSheetEngine?.getRollProfile?.().characterName === 'Mara');
      const tabs = page.getByRole('tablist', { name: 'Páginas da ficha' });
      const first = tabs.getByRole('tab', { name: 'Página I' });
      const second = tabs.getByRole('tab', { name: 'Página II' });
      const pageOne = page.locator('#page-1');
      const pageTwo = page.locator('#page-2');
      await first.waitFor({ state: 'visible' });
      await page.waitForFunction(() => Boolean(document.querySelector('#page-2 textarea[aria-label="Histórico do personagem"]')));
      assert.strictEqual(await first.getAttribute('aria-selected'), 'true', `${mode}: first tab must start selected`);
      assert.strictEqual(await second.getAttribute('aria-selected'), 'false', `${mode}: second tab must start unselected`);
      assert.strictEqual(await pageOne.getAttribute('aria-hidden'), 'false', `${mode}: active panel must be exposed`);
      assert.strictEqual(await pageTwo.getAttribute('aria-hidden'), 'true', `${mode}: inactive panel must be hidden`);
      assert.strictEqual(await pageTwo.evaluate(el => el.inert), true, `${mode}: inactive panel must be inert`);

      await first.focus();
      await page.keyboard.press('ArrowRight');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-2', `${mode}: ArrowRight must move focus`);
      assert.strictEqual(await second.getAttribute('aria-selected'), 'true', `${mode}: ArrowRight must activate second tab`);
      assert.strictEqual(await pageTwo.getAttribute('aria-hidden'), 'false', `${mode}: second panel must become accessible`);
      assert.strictEqual(await pageTwo.evaluate(el => el.inert), false, `${mode}: active panel must not be inert`);
      assert.strictEqual(await pageOne.evaluate(el => el.inert), true, `${mode}: previous panel must become inert`);

      await page.keyboard.press('ArrowLeft');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-1', `${mode}: ArrowLeft must return focus`);
      assert.strictEqual(await first.getAttribute('aria-selected'), 'true', `${mode}: ArrowLeft must activate first tab`);
      await page.keyboard.press('End');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-2', `${mode}: End must focus last tab`);
      await page.keyboard.press('Home');
      assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-tab-page-1', `${mode}: Home must focus first tab`);
      assert.strictEqual(await page.locator('#page-2 textarea').getAttribute('aria-label'), 'Histórico do personagem', `${mode}: history field must be named`);
      assert.deepStrictEqual(errors, [], `${mode}: browser runtime errors`);
      await context.close();
    }
    console.log('PASS v1.5.6 sheet page tabs accessibility: desktop/mobile ARIA, inert panels, arrow keys, Home/End');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
