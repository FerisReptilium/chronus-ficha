'use strict';

// Real Auth + PostgREST integration against the disposable local Supabase stack.
// Creates two isolated users and two independent sessions for one user, then
// verifies account isolation and atomic revision-CAS under concurrent writes.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({ API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey })) {
  assert.ok(value, name + ' must be provided by Supabase local CLI environment');
}

const base = apiUrl.replace(/\/+$/, '');
const runTag = (process.env.GITHUB_RUN_ID || 'local') + '-' + crypto.randomBytes(5).toString('hex');
const password = crypto.randomBytes(24).toString('base64url');
const createdUsers = [];

async function request(path, { method = 'GET', key = anonKey, token = key, body, prefer } = {}) {
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
  const email = 'chronus-' + label + '-' + runTag + '@example.invalid';
  const result = await request('/auth/v1/admin/users', {
    method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
    body: { email, password, email_confirm: true, user_metadata: { display_name: 'Disposable ' + label } }
  });
  assert.equal(result.status, 200, 'Admin API must create disposable ' + label + ' user: ' + JSON.stringify(result.data));
  const userId = result.data?.id;
  assert.ok(userId, 'created user must have an id');
  createdUsers.push(userId);
  return { id: userId, email };
}

async function signIn(user) {
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: user.email, password }
  });
  assert.equal(result.status, 200, 'password sign-in must succeed: ' + JSON.stringify(result.data));
  assert.ok(result.data?.access_token, 'Auth must return an access token');
  assert.equal(result.data.user?.id, user.id, 'Auth session must belong to expected identity');
  return result.data.access_token;
}

async function listCharacters(token) {
  return request('/rest/v1/characters?select=id,user_id,name,data,revision&order=created_at.desc', { token });
}

async function insertCharacter(token, userId, name) {
  const result = await request('/rest/v1/characters?select=id,user_id,name,data,revision', {
    method: 'POST', token, prefer: 'return=representation',
    body: { user_id: userId, name, data: { integration_test: true } }
  });
  assert.equal(result.status, 201, 'owner must create a character: ' + JSON.stringify(result.data));
  assert.equal(result.data?.length, 1, 'character insert must return exactly one row');
  return result.data[0];
}

async function updateAtRevision(token, character, revision, writer) {
  const query = new URLSearchParams({
    id: 'eq.' + character.id, user_id: 'eq.' + character.user_id,
    revision: 'eq.' + revision, select: 'id,user_id,name,revision'
  });
  return request('/rest/v1/characters?' + query.toString(), {
    method: 'PATCH', token, prefer: 'return=representation',
    body: { name: 'CAS winner ' + writer, data: { integration_test: true, writer } }
  });
}

async function cleanup() {
  for (const id of createdUsers.reverse()) {
    const result = await request('/auth/v1/admin/users/' + encodeURIComponent(id), {
      method: 'DELETE', key: serviceRoleKey, token: serviceRoleKey
    });
    if (!result.ok && result.status !== 404) {
      throw new Error('Could not clean disposable Auth user ' + id + ': HTTP ' + result.status);
    }
  }
}

(async () => {
  try {
    const userA = await createUser('session-a');
    const userB = await createUser('session-b');
    // Three independent authenticated sessions: two tabs for A and one for B.
    const [sessionA1, sessionA2, sessionB] = await Promise.all([
      signIn(userA), signIn(userA), signIn(userB)
    ]);

    const characterA = await insertCharacter(sessionA1, userA.id, 'Disposable A character');
    const characterB = await insertCharacter(sessionB, userB.id, 'Disposable B character');

    // Account-switch boundary: each identity sees only its own records; two
    // independently authenticated tabs for A see the same A-owned record.
    const [viewA1, viewA2, viewB] = await Promise.all([
      listCharacters(sessionA1), listCharacters(sessionA2), listCharacters(sessionB)
    ]);
    for (const view of [viewA1, viewA2, viewB]) assert.equal(view.status, 200);
    assert.deepEqual(viewA1.data.map(row => row.id), [characterA.id], 'session A1 must see only A data');
    assert.deepEqual(viewA2.data.map(row => row.id), [characterA.id], 'session A2 must see same A data');
    assert.deepEqual(viewB.data.map(row => row.id), [characterB.id], 'session B must see only B data');

    const crossUpdate = await request('/rest/v1/characters?id=eq.' + characterA.id, {
      method: 'PATCH', token: sessionB, prefer: 'return=representation',
      body: { name: 'Unauthorized cross-account update' }
    });
    assert.equal(crossUpdate.status, 200, 'RLS-hidden cross-account update should return an empty result');
    assert.deepEqual(crossUpdate.data, [], 'cross-account update must affect zero rows');

    const forgedInsert = await request('/rest/v1/characters', {
      method: 'POST', token: sessionB, prefer: 'return=representation',
      body: { user_id: userA.id, name: 'Forged owner', data: {} }
    });
    assert.ok([401, 403].includes(forgedInsert.status), 'cross-account insert must be rejected by RLS');

    // Two independent sessions read one revision and race to save. Exactly one
    // wins; the stale writer must affect zero rows.
    const expectedRevision = Number(characterA.revision);
    assert.equal(expectedRevision, 1, 'fresh character must start at revision 1');
    const [writeA, writeB] = await Promise.all([
      updateAtRevision(sessionA1, characterA, expectedRevision, 'tab-A'),
      updateAtRevision(sessionA2, characterA, expectedRevision, 'tab-B')
    ]);
    assert.equal(writeA.status, 200, 'first CAS request must be accepted at HTTP layer');
    assert.equal(writeB.status, 200, 'second CAS request must be accepted at HTTP layer');
    const accepted = [writeA, writeB].filter(result => Array.isArray(result.data) && result.data.length === 1);
    const rejected = [writeA, writeB].filter(result => Array.isArray(result.data) && result.data.length === 0);
    assert.equal(accepted.length, 1, 'exactly one simultaneous writer must win');
    assert.equal(rejected.length, 1, 'stale simultaneous writer must lose without overwriting');

    const finalRead = await listCharacters(sessionA1);
    assert.equal(finalRead.status, 200);
    const finalCharacter = finalRead.data.find(row => row.id === characterA.id);
    assert.ok(finalCharacter, 'winning character must remain visible to owner');
    assert.equal(Number(finalCharacter.revision), expectedRevision + 1, 'revision must increment exactly once');
    assert.equal(finalCharacter.name, accepted[0].data[0].name, 'persisted state must match winning writer');

    const staleRetry = await updateAtRevision(sessionA2, characterA, expectedRevision, 'stale-retry');
    assert.equal(staleRetry.status, 200);
    assert.deepEqual(staleRetry.data, [], 'retry with stale revision must remain rejected');

    console.log('PASS: real Supabase Auth sessions, account isolation, cross-account RLS, concurrent revision CAS');
  } finally {
    await cleanup();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
