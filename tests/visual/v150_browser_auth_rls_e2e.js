'use strict';

// Full browser authentication and RLS E2E against the disposable local Supabase stack.
// The production config.js is intercepted in-memory; no production endpoint is contacted.
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
const password = 'Chronus-E2E-' + crypto.randomBytes(12).toString('hex') + '!';
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

async function createUser(label) {
  const email = 'chronus-browser-' + label + '-' + runTag + '@example.invalid';
  const result = await api('/auth/v1/admin/users', {
    method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
    body: {
      email, password, email_confirm: true,
      user_metadata: { display_name: 'Browser ' + label.toUpperCase() }
    }
  });
  assert.equal(result.status, 200, 'Admin API must create disposable user: ' + JSON.stringify(result.data));
  const id = result.data?.id;
  assert.ok(id, 'created user must have an id');
  createdUsers.push(id);
  const login = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password }
  });
  assert.equal(login.status, 200, 'disposable user must authenticate');
  assert.equal(login.data.user.id, id);
  const character = await api('/rest/v1/characters?select=id,user_id,name,revision', {
    method: 'POST', token: login.data.access_token, prefer: 'return=representation',
    body: { user_id: id, name: 'Browser-owned ' + label, data: { browser_e2e: true, marker: label } }
  });
  assert.equal(character.status, 201, 'owner must create E2E fixture: ' + JSON.stringify(character.data));
  assert.equal(character.data.length, 1);
  return { id, email, characterId: character.data[0].id, name: 'Browser ' + label.toUpperCase() };
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
    assert.ok(body.includes("SUPABASE_PUBLISHABLE_KEY: '" + anonKey + "'"), 'local anon key must replace production config');
    await route.fulfill({ response, body });
  });
}

async function loginThroughUi(page, user) {
  await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ChronusAuth && window.ChronusSupabase));
  await page.locator('#btn-nav-login').click();
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#authLoginButton').click();
  await page.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, user.id);
  await page.locator('#nav-user-area .user-name').waitFor({ state: 'visible' });
  const displayedName = await page.locator('#nav-user-area .user-name').textContent();
  assert.equal(displayedName, user.name, 'header must display the authenticated profile identity');
}

async function visibleCharacterIds(page) {
  return page.evaluate(async () => {
    const client = window.ChronusSupabase.getClient();
    const { data, error } = await client.from('characters').select('id,user_id,name,revision');
    if (error) throw new Error(error.message);
    return data.map(row => ({ id: row.id, owner: row.user_id, name: row.name }));
  });
}

(async () => {
  let browser;
  try {
    const userA = await createUser('a');
    const userB = await createUser('b');
    browser = await chromium.launch({ headless: true });

    // Two independent browser contexts represent isolated browser sessions.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await Promise.all([interceptLocalConfig(pageA), interceptLocalConfig(pageB)]);

    await Promise.all([loginThroughUi(pageA, userA), loginThroughUi(pageB, userB)]);

    const [rowsA, rowsB] = await Promise.all([
      visibleCharacterIds(pageA), visibleCharacterIds(pageB)
    ]);
    assert.deepEqual(rowsA.map(row => row.id), [userA.characterId],
      'authenticated browser A must see only its own character');
    assert.deepEqual(rowsB.map(row => row.id), [userB.characterId],
      'authenticated browser B must see only its own character');
    assert.ok(rowsA.every(row => row.owner === userA.id));
    assert.ok(rowsB.every(row => row.owner === userB.id));

    // Switch identity inside the same browser context through the real logout/login UI.
    pageA.once('dialog', dialog => dialog.accept());
    await pageA.locator('#btn-nav-logout').click();
    await pageA.waitForFunction(() => !window.ChronusAuth?.getUser());
    await pageA.waitForSelector('#btn-nav-login', { state: 'visible' });
    await pageA.locator('#btn-nav-login').click();
    await pageA.locator('#authEmail').fill(userB.email);
    await pageA.locator('#authPassword').fill(password);
    await pageA.locator('#authLoginButton').click();
    await pageA.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, userB.id);
    const switchedRows = await visibleCharacterIds(pageA);
    assert.deepEqual(switchedRows.map(row => row.id), [userB.characterId],
      'after switching accounts, prior account data must not remain visible');
    assert.ok(switchedRows.every(row => row.owner === userB.id));

    // The independent B session must remain authenticated and unaffected by A's switch.
    const identityB = await pageB.evaluate(() => window.ChronusAuth?.getUser()?.id);
    assert.equal(identityB, userB.id, 'switching context A must not alter independent context B');

    await contextA.close();
    await contextB.close();
    console.log('PASS: real browser UI login, two isolated sessions, RLS data isolation, logout and account switch');
  } finally {
    if (browser) await browser.close();
    await cleanup();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
