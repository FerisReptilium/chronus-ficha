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
const createdSessions = [];

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
  return { id, email, characterId: character.data[0].id, name: 'Browser ' + label.toUpperCase(), characterName: 'Browser-owned ' + label };
}

async function cleanup() {
  for (const id of createdSessions.reverse()) {
    const result = await api('/rest/v1/campaign_sessions?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE', key: serviceRoleKey, token: serviceRoleKey
    });
    if (!result.ok && result.status !== 404) throw new Error('Could not clean disposable session ' + id + ': HTTP ' + result.status);
  }
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

async function waitForAuthFormReady(page) {
  const title = page.locator('#authForm h2');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await page.locator('#authModeToggle').click();
    if ((await title.textContent())?.trim() === 'Criar conta') {
      await page.locator('#authModeToggle').click();
      await page.waitForFunction(() =>
        document.querySelector('#authForm h2')?.textContent?.trim() === 'CHRONUS'
      );
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Auth form handlers did not initialize before the browser login test');
}

async function openAuthModalThroughUi(page) {
  await page.locator('#btn-nav-login').click();
  // The static header can render before auth.init() replaces it with the
  // event-bound control. Use the same public modal entry point as a
  // deterministic fallback, then interact with the real visible form.
  await page.evaluate(() => {
    if (typeof window.ChronusAuth?.showAuthModal !== 'function') {
      throw new Error('ChronusAuth.showAuthModal is not available');
    }
    window.ChronusAuth.showAuthModal();
  });
  await page.locator('#authGate').waitFor({ state: 'visible' });
  await waitForAuthFormReady(page);
}

async function loginThroughUi(page, user, expectedRoute = '#/player') {
  await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ChronusAuth && window.ChronusSupabase));
  await openAuthModalThroughUi(page);
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#authLoginButton').click();
  await page.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, user.id);
  await page.locator('#nav-user-area .user-name').waitFor({ state: 'visible' });
  // Wait for the login form's async submit handler to finish its role-based redirect
  // before callers navigate elsewhere; otherwise a late redirect can overwrite LIVE.
  await page.waitForFunction(expected => window.location.hash === expected, expectedRoute, { timeout: 10000 });
  const displayedName = await page.locator('#nav-user-area .user-name').textContent();
  assert.equal(displayedName, user.name, 'header must display the authenticated profile identity');
}

async function navigateToLive(page, sessionId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // Changing the hash may synchronously trigger the app's route transition.
      // Playwright can lose the current execution context while that transition
      // is in progress; treat that as navigation, not as a terminal test failure.
      await page.evaluate(id => {
        window.location.hash = '#/live?session=' + encodeURIComponent(id);
      }, sessionId);
      await page.waitForFunction(() => window.location.hash.startsWith('#/live?session='), undefined, { timeout: 5000 });
      await page.locator('#chronus-live-connection-status').waitFor({ state: 'visible', timeout: 5000 });
      return;
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  throw new Error('Browser could not remain on the selected CHRONUS LIVE session route');
}

async function liveDiagnostics(page, sessionId) {
  return page.evaluate(async expectedSessionId => {
    const client = window.ChronusSupabase?.getClient?.();
    const user = window.ChronusAuth?.getUser?.();
    if (!client || !user) return { hash: location.hash, userId: user?.id || null, status: document.querySelector('#chronus-live-connection-status')?.innerText || null };
    const [profile, session, membership] = await Promise.all([
      client.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle(),
      client.from('campaign_sessions').select('id,title,status').eq('id', expectedSessionId).maybeSingle(),
      client.from('chronus_live_session_members').select('session_id,user_id').eq('session_id', expectedSessionId).eq('user_id', user.id).maybeSingle()
    ]);
    return {
      hash: location.hash,
      userId: user.id,
      status: document.querySelector('#chronus-live-connection-status')?.innerText || null,
      profile: { data: profile.data, error: profile.error?.message || null },
      session: { data: session.data, error: session.error?.message || null },
      membership: { data: membership.data, error: membership.error?.message || null },
      roster: document.querySelector('#chronus-live-roster')?.innerText || null
    };
  }, sessionId);
}

async function visibleCharacterIds(page, expectedUserId) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await page.waitForFunction(async expected => {
        const client = window.ChronusSupabase?.getClient?.();
        if (!client) return false;
        const { data, error } = await client.auth.getSession();
        return !error && data?.session?.user?.id === expected;
      }, expectedUserId, { timeout: 15000 });
      return await page.evaluate(async expected => {
        const client = window.ChronusSupabase?.getClient?.();
        if (!client) throw new Error('Supabase client unavailable after navigation');
        const { data: authData, error: authError } = await client.auth.getSession();
        if (authError || authData?.session?.user?.id !== expected) {
          throw new Error('Supabase token did not finish switching to the expected account');
        }
        const { data, error } = await client.from('characters').select('id,user_id,name,revision');
        if (error) throw new Error(error.message);
        return data.map(row => ({ id: row.id, owner: row.user_id, name: row.name }));
      }, expectedUserId);
    } catch (error) {
      lastError = error;
      if (!/Execution context was destroyed|Most likely the page has been closed|Target page, context or browser has been closed|Supabase client unavailable|Failed to fetch|Browser identity changed/i.test(String(error))) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  throw lastError || new Error('Could not query visible character rows after navigation');
}

(async () => {
  let browser;
  try {
    const userA = await createUser('a');
    const userB = await createUser('b');
    const userNarrator = await createUser('narrator');
    const userGuest = await createUser('guest');
    const narratorProfile = await api('/rest/v1/profiles?id=eq.' + encodeURIComponent(userNarrator.id), {
      method: 'PATCH', key: serviceRoleKey, token: serviceRoleKey, body: { role: 'narrator' }
    });
    assert.ok(narratorProfile.status === 204 || narratorProfile.status === 200,
      'trusted service role must provision the narrator profile: HTTP ' + narratorProfile.status);
    const verifiedNarratorProfile = await api('/rest/v1/profiles?id=eq.' + encodeURIComponent(userNarrator.id) + '&select=role', {
      key: serviceRoleKey, token: serviceRoleKey
    });
    assert.equal(verifiedNarratorProfile.data?.[0]?.role, 'narrator',
      'trusted service role must persist the narrator role: ' + JSON.stringify(verifiedNarratorProfile.data));
    const sessionResult = await api('/rest/v1/campaign_sessions?select=id', {
      method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
      prefer: 'return=representation',
      body: {
        session_number: Math.floor(Date.now() / 1000),
        title: 'Browser LIVE session ' + runTag,
        slug: 'browser-live-' + runTag,
        summary: 'Disposable session for authenticated LIVE E2E',
        status: 'in_progress', visibility: 'narrator', published: false,
        created_by: userNarrator.id
      }
    });
    assert.equal(sessionResult.status, 201, 'service role must create disposable LIVE session: ' + JSON.stringify(sessionResult.data));
    const sessionId = sessionResult.data?.[0]?.id;
    assert.ok(sessionId, 'disposable LIVE session must have an id');
    createdSessions.push(sessionId);
    const members = await api('/rest/v1/chronus_live_session_members', {
      method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
      body: [
        { session_id: sessionId, user_id: userA.id, created_by: userNarrator.id },
        { session_id: sessionId, user_id: userB.id, created_by: userNarrator.id }
      ]
    });
    assert.equal(members.status, 201, 'service role must provision both session memberships: ' + JSON.stringify(members.data));
    browser = await chromium.launch({ headless: true });

    // Two independent browser contexts represent isolated browser sessions.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextNarrator = await browser.newContext();
    const contextGuest = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageNarrator = await contextNarrator.newPage();
    const pageGuest = await contextGuest.newPage();
    await Promise.all([interceptLocalConfig(pageA), interceptLocalConfig(pageB), interceptLocalConfig(pageNarrator), interceptLocalConfig(pageGuest)]);

    await Promise.all([loginThroughUi(pageA, userA), loginThroughUi(pageB, userB)]);

    const [rowsA, rowsB] = await Promise.all([
      visibleCharacterIds(pageA, userA.id), visibleCharacterIds(pageB, userB.id)
    ]);
    assert.deepEqual(rowsA.map(row => row.id), [userA.characterId],
      'authenticated browser A must see only its own character');
    assert.deepEqual(rowsB.map(row => row.id), [userB.characterId],
      'authenticated browser B must see only its own character');
    assert.ok(rowsA.every(row => row.owner === userA.id));
    assert.ok(rowsB.every(row => row.owner === userB.id));

    // Verify real Supabase Realtime Presence with two independently authenticated
    // browser contexts. Both pages must see both accounts in the same private room.
    await Promise.all([navigateToLive(pageA, sessionId), navigateToLive(pageB, sessionId)]);
    await Promise.all([
      pageA.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, userA.id, { timeout: 10000 }),
      pageB.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, userB.id, { timeout: 10000 })
    ]);
    await Promise.all([pageA, pageB].map(async (page, index) => {
      try {
        await page.waitForFunction(() => document.querySelector('#chronus-live-connection-status strong')?.textContent === 'Mesa sincronizada', undefined, { timeout: 20000 });
      } catch (error) {
        const diagnostics = await liveDiagnostics(page, sessionId);
        throw new Error('LIVE presence did not synchronize in browser ' + (index ? 'B' : 'A') + ': ' + JSON.stringify(diagnostics) + '\\n' + error.message);
      }
    }));
    await Promise.all([
      pageA.waitForFunction(() => document.querySelectorAll('#chronus-live-roster .chronus-live-participant').length === 2, undefined, { timeout: 20000 }),
      pageB.waitForFunction(() => document.querySelectorAll('#chronus-live-roster .chronus-live-participant').length === 2, undefined, { timeout: 20000 })
    ]);
    const [rosterA, rosterB] = await Promise.all([
      pageA.locator('#chronus-live-roster').innerText(),
      pageB.locator('#chronus-live-roster').innerText()
    ]);
    assert.ok(rosterA.includes(userA.characterName) && rosterA.includes(userB.characterName),
      'browser A must see both authenticated characters in the shared LIVE room; expected '
      + JSON.stringify([userA.characterName, userB.characterName]) + ', received ' + JSON.stringify(rosterA));
    assert.ok(rosterB.includes(userA.characterName) && rosterB.includes(userB.characterName),
      'browser B must see both authenticated characters in the shared LIVE room; expected '
      + JSON.stringify([userA.characterName, userB.characterName]) + ', received ' + JSON.stringify(rosterB));

    // Narrator UI must be able to grant and revoke session membership without a service key.
    await loginThroughUi(pageNarrator, userNarrator, '#/narrator');
    await navigateToLive(pageNarrator, sessionId);
    try {
      await pageNarrator.locator('#chronus-live-session-admin').waitFor({ state: 'visible', timeout: 20000 });
    } catch (error) {
      const diagnostics = await liveDiagnostics(pageNarrator, sessionId);
      throw new Error('Narrator membership panel did not initialize: ' + JSON.stringify(diagnostics) + '\\n' + error.message);
    }
    const memberSelect = pageNarrator.locator('#chronus-live-member-player');
    await pageNarrator.waitForFunction(expected => {
      const select = document.querySelector('#chronus-live-member-player');
      return Boolean(select && Array.from(select.options).some(option => option.value === expected));
    }, userGuest.id, { timeout: 10000 });
    await memberSelect.selectOption(userGuest.id);
    await pageNarrator.locator('#chronus-live-member-add').click();
    await pageNarrator.waitForFunction(expected => {
      const list = document.querySelector('#chronus-live-session-members');
      return Boolean(list && list.innerText.includes(expected));
    }, userGuest.name, { timeout: 10000 });

    await loginThroughUi(pageGuest, userGuest);
    await navigateToLive(pageGuest, sessionId);
    await pageGuest.waitForFunction(() => document.querySelector('#chronus-live-connection-status strong')?.textContent === 'Mesa sincronizada', undefined, { timeout: 20000 });

    const guestRow = pageNarrator.locator('#chronus-live-session-members li').filter({ hasText: userGuest.name });
    await guestRow.locator('button').click();
    await pageNarrator.waitForFunction(expected => {
      const list = document.querySelector('#chronus-live-session-members');
      return Boolean(list && !list.innerText.includes(expected));
    }, userGuest.name, { timeout: 10000 });
    await pageGuest.reload({ waitUntil: 'domcontentloaded' });
    await pageGuest.waitForFunction(() => document.querySelector('#chronus-live-connection-status strong')?.textContent === 'Sem acesso a esta sessão', undefined, { timeout: 20000 });

    // Switch identity inside the same browser context through the real logout/login UI.
    pageA.once('dialog', dialog => dialog.accept());
    await pageA.locator('#btn-nav-logout').click();
    await pageA.waitForFunction(() => !window.ChronusAuth?.getUser());
    await pageA.waitForSelector('#btn-nav-login', { state: 'visible' });
    await openAuthModalThroughUi(pageA);
    await pageA.locator('#authEmail').fill(userB.email);
    await pageA.locator('#authPassword').fill(password);
    await pageA.locator('#authLoginButton').click();
    await pageA.waitForFunction(expected => window.ChronusAuth?.getUser()?.id === expected, userB.id);
    const switchedRows = await visibleCharacterIds(pageA, userB.id);
    assert.deepEqual(switchedRows.map(row => row.id), [userB.characterId],
      'after switching accounts, prior account data must not remain visible');
    assert.ok(switchedRows.every(row => row.owner === userB.id));

    // The independent B session must remain authenticated and unaffected by A's switch.
    const identityB = await pageB.evaluate(() => window.ChronusAuth?.getUser()?.id);
    assert.equal(identityB, userB.id, 'switching context A must not alter independent context B');

    await contextA.close();
    await contextB.close();
    await contextNarrator.close();
    await contextGuest.close();
    console.log('PASS: browser Auth/RLS, account switch, session presence, and Narrator membership grant/revoke');
  } finally {
    if (browser) await browser.close();
    await cleanup();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
