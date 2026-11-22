'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const origin = process.env.CHRONUS_PREVIEW_ORIGIN || 'http://127.0.0.1:4173';
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronus-v149-profile-'));

const supabaseMock = String.raw`
(() => {
  const currentUser = () => {
    const id = localStorage.getItem('chronus.e2e.identity') || 'account-A';
    return { id, email: id.toLowerCase() + '@example.invalid' };
  };
  const cloudKey = id => 'chronus.e2e.cloud.' + id;
  const initialCharacter = id => ({
    id: 'character-' + id, user_id: id, name: 'Ficha ' + id,
    updated_at: '2026-11-22T12:00:00.000Z', revision: 1,
    data: {
      identity: { name: 'Personagem ' + id, player: id, tradition: 'Ordem de Hermes', concept: 'Teste E2E', profession: 'Investigador', chronicle: 'CHRONUS' },
      personalities: ['Analítico'],
      attributes: { 'Força': 'd6', 'Vigor': 'd8', 'Destreza': 'd8', 'Razão': 'd8', 'Astúcia': 'd8', 'Perseverança': 'd8', 'Manipulação': 'd6', 'Presença': 'd6', 'Vontade': 'd8' },
      illumination: 'd4', resources: { determination: 8, mana: 10, wounds: 0 },
      lists: { skills: [{ marker: 'filled', text: 'Investigação' }], advantages: [], equipment: [], formulas: [], arcana: {} },
      page2: { formulas: [], inventory: [], history: '' }, markers: {}, paradox: 0, activePage: 'page-1'
    }
  });
  const readCharacter = id => {
    try { return JSON.parse(localStorage.getItem(cloudKey(id))) || initialCharacter(id); }
    catch (_) { return initialCharacter(id); }
  };
  const writeCharacter = (id, value) => localStorage.setItem(cloudKey(id), JSON.stringify(value));
  for (const id of ['account-A', 'account-B']) if (!localStorage.getItem(cloudKey(id))) writeCharacter(id, initialCharacter(id));

  function makeQuery(table) {
    const user = currentUser();
    const filters = {};
    let payload = null;
    const rows = () => table === 'profiles'
      ? [{ id: user.id, display_name: user.id, email: user.email, role: 'player' }]
      : table === 'characters' ? [readCharacter(user.id)] : [];
    const result = () => rows().filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; return query; },
      order() { return query; },
      limit() { return query; },
      update(value) { payload = value; return query; },
      insert() { return query; },
      maybeSingle: async () => ({ data: result()[0] || null, error: null }),
      single: async () => {
        if (payload && table === 'characters') {
          if (window.__CHRONUS_E2E_BLOCK_SAVE) return { data: null, error: { message: 'E2E interrupted write' } };
          const current = readCharacter(user.id);
          const next = { ...current, ...payload, revision: Number(current.revision || 1) + 1, updated_at: new Date().toISOString() };
          writeCharacter(user.id, next);
          return { data: { revision: next.revision, updated_at: next.updated_at }, error: null };
        }
        return { data: result()[0] || null, error: null };
      },
      then(resolve, reject) { return Promise.resolve({ data: result(), error: null }).then(resolve, reject); }
    };
    return query;
  }

  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user: currentUser() } }, error: null }),
      signOut: async () => ({ error: null })
    },
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'E2E without portrait' } }) }) },
    from: table => makeQuery(table)
  };
  window.supabase = { createClient: () => client };
})();
`;

async function prepareContext(context, identity, failLocalStorage = false) {
  await context.addInitScript(({ identity, failLocalStorage }) => {
    if (!localStorage.getItem('chronus.e2e.identity')) localStorage.setItem('chronus.e2e.identity', identity);
    if (failLocalStorage) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key) === 'chronus.sheet.' + identity) throw new DOMException('Injected quota failure', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }
  }, { identity, failLocalStorage });
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseMock }));
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  await context.route('https://www.youtube.com/iframe_api', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
}

async function openSheet(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(origin + '/#/sheet', { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(response?.status(), 200, 'portal must load');
  await page.waitForFunction(() => window.ChronusSheetEngine?.getRollProfile?.().characterName?.startsWith('Personagem '), { timeout: 25000 });
  return { page, errors };
}

(async () => {
  let persistent;
  try {
    persistent = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1440, height: 1000 } });
    await prepareContext(persistent, 'account-A', true);
    const first = await openSheet(persistent);
    const second = await openSheet(persistent);

    const nameField = first.page.locator('[data-bind="identity.name"]');
    await nameField.fill('Personagem A — edição pendente');
    await nameField.dispatchEvent('input');
    await first.page.waitForFunction(() => window.__chronusSheetBackupWrite instanceof Promise);
    await first.page.evaluate(() => window.__chronusSheetBackupWrite);

    // A second real tab in the same Chromium profile must see the shared account cache.
    await second.page.reload({ waitUntil: 'domcontentloaded' });
    await second.page.waitForFunction(() => window.ChronusSheetEngine?.getRollProfile?.().characterName === 'Personagem A — edição pendente', { timeout: 20000 });

    // Fault-inject a network failure during the cloud save, then restore connectivity.
    await first.page.evaluate(() => { window.__CHRONUS_E2E_BLOCK_SAVE = true; });
    await nameField.fill('Personagem A — rede interrompida');
    await nameField.dispatchEvent('input');
    await first.page.waitForTimeout(700);
    await first.page.evaluate(() => { window.__CHRONUS_E2E_BLOCK_SAVE = false; window.dispatchEvent(new Event('online')); });
    await first.page.waitForTimeout(1800);

    // Closing the context and relaunching the same profile is stronger than a page reload.
    await second.page.close();
    await first.page.close();
    await persistent.close();
    persistent = null;

    persistent = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1440, height: 1000 } });
    await prepareContext(persistent, 'account-A', false);
    const recovered = await openSheet(persistent);
    const recoveredName = await recovered.page.locator('[data-bind="identity.name"]').inputValue();
    assert.equal(recoveredName, 'Personagem A — rede interrompida', 'closed browser profile must recover the last IndexedDB snapshot');

    // Switch identity in the same persisted profile; B must never hydrate A's backup.
    await recovered.page.evaluate(() => localStorage.setItem('chronus.e2e.identity', 'account-B'));
    await recovered.page.reload({ waitUntil: 'domcontentloaded' });
    await recovered.page.waitForFunction(() => window.ChronusSheetEngine?.getRollProfile?.().characterName === 'Personagem account-B', { timeout: 20000 });
    assert.equal(await recovered.page.locator('[data-bind="identity.name"]').inputValue(), 'Personagem account-B');

    await recovered.page.evaluate(() => localStorage.setItem('chronus.e2e.identity', 'account-A'));
    await recovered.page.reload({ waitUntil: 'domcontentloaded' });
    await recovered.page.waitForFunction(() => window.ChronusSheetEngine?.getRollProfile?.().characterName === 'Personagem A — rede interrompida', { timeout: 20000 });
    assert.equal(await recovered.page.locator('[data-bind="identity.name"]').inputValue(), 'Personagem A — rede interrompida');
    assert.deepEqual(recovered.errors, [], 'browser must not emit uncaught runtime errors');

    console.log('CHRONUS v1.4.9 real Chromium multi-tab, storage recovery and account isolation: PASS');
  } finally {
    if (persistent) await persistent.close().catch(() => {});
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
