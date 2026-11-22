'use strict';

// Real browser sheet editing, cloud persistence, reload hydration and concurrent CAS.
// Runs only against the disposable local Supabase stack; production config is intercepted.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const portalUrl = process.env.CHRONUS_PORTAL_URL || 'http://127.0.0.1:4173/';

for (const [name, value] of Object.entries({ API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey })) {
  assert.ok(value, name + ' must be provided by disposable Supabase local CLI environment');
}

const base = apiUrl.replace(/\/+$/, '');
const runTag = (process.env.GITHUB_RUN_ID || 'local') + '-' + crypto.randomBytes(5).toString('hex');
const password = 'Chronus-Sheet-E2E-' + crypto.randomBytes(12).toString('hex') + '!';
const createdUsers = [];

async function api(path, { method = 'GET', key = anonKey, token = key, body, prefer } = {}) {
  const headers = { apikey: key, Authorization: 'Bearer ' + token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { status: response.status, ok: response.ok, data };
}

async function createUser() {
  const email = 'chronus-sheet-' + runTag + '@example.invalid';
  const result = await api('/auth/v1/admin/users', {
    method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
    body: {
      email, password, email_confirm: true,
      user_metadata: { display_name: 'Sheet E2E Player' }
    }
  });
  assert.equal(result.status, 200, 'Admin API must create disposable sheet user: ' + JSON.stringify(result.data));
  const id = result.data?.id;
  assert.ok(id, 'created user must have an id');
  createdUsers.push(id);
  const login = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password }
  });
  assert.equal(login.status, 200, 'disposable sheet user must authenticate');
  const character = await api('/rest/v1/characters?select=id,user_id,name,revision', {
    method: 'POST', token: login.data.access_token, prefer: 'return=representation',
    body: { user_id: id, name: 'Sheet E2E fixture', data: { browser_sheet_e2e: true } }
  });
  assert.equal(character.status, 201, 'owner must create sheet fixture: ' + JSON.stringify(character.data));
  assert.equal(character.data.length, 1);
  return { id, email, characterId: character.data[0].id };
}

async function cleanup() {
  for (const id of createdUsers.reverse()) {
    const result = await api('/auth/v1/admin/users/' + encodeURIComponent(id), {
      method: 'DELETE', key: serviceRoleKey, token: serviceRoleKey
    });
    if (!result.ok && result.status !== 404) {
      throw new Error('Could not clean disposable Auth user ' + id + ': HTTP ' + result.status);
    }
  }
}

async function interceptLocalConfig(page) {
  await page.route('**/js/config.js', async route => {
    const response = await route.fetch();
    let body = await response.text();
    body = body
      .replace(/SUPABASE_URL:\s*'[^']*'/, "SUPABASE_URL: '" + base + "'")
      .replace(/SUPABASE_PUBLISHABLE_KEY:\s*'[^']*'/, "SUPABASE_PUBLISHABLE_KEY: '" + anonKey + "'");
    assert.ok(body.includes("SUPABASE_URL: '" + base + "'"), 'local Supabase URL must replace production config');
    assert.ok(body.includes("SUPABASE_PUBLISHABLE_KEY: '" + anonKey + "'"), 'local publishable key must replace production config');
    await route.fulfill({ response, body });
  });
}

async function openAuthModalThroughUi(page) {
  await page.locator('#btn-nav-login').click();
  await page.evaluate(() => {
    if (typeof window.ChronusAuth?.showAuthModal !== 'function') {
      throw new Error('ChronusAuth.showAuthModal is not available');
    }
    window.ChronusAuth.showAuthModal();
  });
  await page.locator('#authGate').waitFor({ state: 'visible' });
}

async function loginThroughUi(page, user) {
  await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ChronusAuth && window.ChronusSupabase));
  await openAuthModalThroughUi(page);
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#authLoginButton').click();
  await page.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, user.id);
}

async function openSheet(page, user) {
  await loginThroughUi(page, user);
  await page.goto(portalUrl + '#/sheet', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, user.id);
  await page.locator('#view-sheet').waitFor({ state: 'visible' });
  await page.locator('[data-bind="identity.name"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('saveIndicator')?.textContent.includes('Salvo na nuvem'));
}

async function waitForFinalSyncState(page) {
  await page.waitForFunction(() => {
    const status = document.getElementById('saveIndicator')?.textContent || '';
    return status.includes('Salvo na nuvem') || status.includes('Conflito de sincronização');
  }, null, { timeout: 20000 });
}

async function readRemoteCharacter(page, userId) {
  return page.evaluate(async ({ userId }) => {
    const { data, error } = await window.ChronusSupabase.getClient()
      .from('characters')
      .select('id,user_id,name,data,revision')
      .eq('user_id', userId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }, { userId });
}

(async () => {
  let browser;
  const contexts = [];
  try {
    const user = await createUser();
    browser = await chromium.launch({ headless: true });

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    contexts.push(contextA, contextB);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await Promise.all([interceptLocalConfig(pageA), interceptLocalConfig(pageB)]);

    // First prove a real form edit reaches PostgREST and survives a full page reload.
    await openSheet(pageA, user);
    const initial = await readRemoteCharacter(pageA, user.id);
    assert.equal(initial.id, user.characterId);
    const persistedName = 'Persisted sheet ' + runTag;
    await pageA.locator('[data-bind="identity.name"]').fill(persistedName);
    await pageA.waitForFunction(() =>
      document.getElementById('saveIndicator')?.textContent.includes('Salvo na nuvem')
    , null, { timeout: 20000 });
    const afterSave = await readRemoteCharacter(pageA, user.id);
    assert.equal(afterSave.name, persistedName, 'sheet name must be persisted to the remote character row');
    assert.equal(afterSave.data.identity.name, persistedName, 'full sheet JSON must persist the edited identity field');
    assert.equal(Number(afterSave.revision), Number(initial.revision) + 1,
      'a successful sheet save must advance the monotonic revision exactly once');

    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, user.id);
    await pageA.locator('#view-sheet').waitFor({ state: 'visible' });
    await pageA.locator('[data-bind="identity.name"]').waitFor({ state: 'visible' });
    await pageA.waitForFunction(expected =>
      document.querySelector('[data-bind="identity.name"]')?.value === expected, persistedName);
    await pageA.waitForFunction(() =>
      document.getElementById('saveIndicator')?.textContent.includes('Salvo na nuvem')
    );
    const afterReload = await readRemoteCharacter(pageA, user.id);
    assert.equal(afterReload.data.identity.name, persistedName,
      'reload must hydrate the saved sheet without reverting the field');

    // A second independent browser context logs into the same account and loads
    // the same revision. A barrier releases both PATCH requests together so the
    // database CAS has a deterministic stale-writer race to resolve.
    await openSheet(pageB, user);
    const baselineA = await readRemoteCharacter(pageA, user.id);
    const baselineB = await readRemoteCharacter(pageB, user.id);
    assert.equal(String(baselineA.revision), String(baselineB.revision),
      'both independent sessions must start the concurrency test from the same revision');
    const baseRevision = Number(baselineA.revision);

    let interceptedPatches = 0;
    let releaseBarrier;
    const barrier = new Promise(resolve => { releaseBarrier = resolve; });
    const gatePatch = async route => {
      const request = route.request();
      if (request.method() === 'PATCH' && request.url().includes('/rest/v1/characters')) {
        interceptedPatches += 1;
        if (interceptedPatches === 2) releaseBarrier();
        await barrier;
      }
      await route.continue();
    };
    await Promise.all([pageA.route('**/rest/v1/characters*', gatePatch), pageB.route('**/rest/v1/characters*', gatePatch)]);

    const valueA = 'Concurrent writer A ' + runTag;
    const valueB = 'Concurrent writer B ' + runTag;
    await Promise.all([
      pageA.locator('[data-bind="identity.name"]').fill(valueA),
      pageB.locator('[data-bind="identity.name"]').fill(valueB)
    ]);
    await Promise.all([waitForFinalSyncState(pageA), waitForFinalSyncState(pageB)]);
    assert.equal(interceptedPatches, 2, 'both tabs must submit a cloud PATCH before either is released');

    const [statusA, statusB] = await Promise.all([
      pageA.locator('#saveIndicator').textContent(),
      pageB.locator('#saveIndicator').textContent()
    ]);
    const aWon = statusA.includes('Salvo na nuvem');
    const bWon = statusB.includes('Salvo na nuvem');
    const aConflicted = statusA.includes('Conflito de sincronização');
    const bConflicted = statusB.includes('Conflito de sincronização');
    assert.equal(Number(aWon) + Number(bWon), 1,
      'exactly one concurrent browser writer must be accepted by CAS: ' + JSON.stringify({ statusA, statusB }));
    assert.equal(Number(aConflicted) + Number(bConflicted), 1,
      'exactly one stale browser writer must receive a visible conflict: ' + JSON.stringify({ statusA, statusB }));

    const winner = await readRemoteCharacter(pageA, user.id);
    assert.equal(Number(winner.revision), baseRevision + 1,
      'the concurrent race must increment the remote revision exactly once');
    assert.ok([valueA, valueB].includes(winner.name), 'remote name must match one complete winning write');
    assert.equal(winner.data.identity.name, winner.name,
      'the persisted JSON and indexed character name must agree after the race');
    const losingLocalValue = aConflicted ? valueA : valueB;
    assert.notEqual(winner.name, losingLocalValue,
      'the losing tab must not overwrite the winning remote state');
    console.log('PASS: browser sheet edit, cloud persistence, reload hydration, and deterministic concurrent CAS conflict');
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close();
    await cleanup();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
