'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sheet = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');

function extractBetween(source, start, end, label) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, label + ': start marker missing');
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, label + ': end marker missing');
  return source.slice(from, to);
}

const listenerMarker = "window.addEventListener('online', () => {";
const listenerStart = sheet.indexOf(listenerMarker);
assert.ok(listenerStart >= 0, 'online listener must exist');
const bodyStart = sheet.indexOf('{', listenerStart + listenerMarker.length - 2) + 1;
const bodyEnd = sheet.indexOf('\n  });', bodyStart);
assert.ok(bodyStart > 0 && bodyEnd > bodyStart, 'online listener body must be extractable');
const onlineBody = sheet.slice(bodyStart, bodyEnd);

function runReconnect({ cloudReady, cloudConflict, sheetDirty, portraitDirty }) {
  const calls = [];
  const values = new Map([
    ['sheet-dirty', sheetDirty ? '1' : '0'],
    ['portrait-dirty', portraitDirty ? '1' : '0']
  ]);
  const sandbox = {
    navigator: { onLine: true },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    },
    clearTimeout: () => calls.push('clear-timeout')
  };
  vm.createContext(sandbox);
  const script = [
    'let cloudUser = { id: "account-A" };',
    'let cloudReady = ' + JSON.stringify(Boolean(cloudReady)) + ';',
    'let cloudCharacterId = "character-A";',
    'let cloudConflict = ' + JSON.stringify(Boolean(cloudConflict)) + ';',
    'let saveTimer = 0;',
    'let bootstrapInProgress = false;',
    'const getScopedKey = type => type === "dirty" ? "sheet-dirty" : "portrait-dirty";',
    'const portraitTombstoneKey = id => "portrait-tombstone." + id;',
    'const setSaveStatus = () => calls.push("status");',
    'const scheduleCloudSave = delay => calls.push("sheet-retry:" + delay);',
    'const persistLocalState = () => calls.push("persist-local");',
    'const bootstrapCloudForUser = () => calls.push("bootstrap");',
    'const syncPendingPortrait = () => { calls.push("portrait-retry"); return Promise.resolve(true); };',
    'const handler = () => {' + onlineBody + '};',
    'handler();',
    'calls;'
  ].join('\n');
  return vm.runInNewContext(script, { ...sandbox, calls });
}

assert.deepEqual(runReconnect({ cloudReady: false, cloudConflict: false, sheetDirty: true, portraitDirty: true }), ['bootstrap'],
  'a failed cloud bootstrap must be retried after the network returns');
assert.deepEqual(runReconnect({ cloudReady: true, cloudConflict: true, sheetDirty: true, portraitDirty: true }), ['portrait-retry'],
  'a character CAS conflict must pause sheet writes but must not block independent portrait cleanup');
const healthyReconnect = runReconnect({ cloudReady: true, cloudConflict: false, sheetDirty: true, portraitDirty: true });
assert.ok(healthyReconnect.includes('sheet-retry:500'), 'dirty sheet must be retried after reconnect');
assert.ok(healthyReconnect.includes('portrait-retry'), 'dirty portrait must be retried independently');

const helper = extractBetween(
  sheet,
  '  async function syncPendingPortrait() {',
  '\n  function showAuthGate',
  'pending portrait retry helper'
);
function makePortraitSync({ online = true, localPortrait = null, pushResult = true, deleteResult = true, delayLoad = false } = {}) {
  const values = new Map([['portrait-dirty', '1']]);
  const calls = [];
  let releaseLoad;
  const context = {
    supabaseClient: {},
    cloudUser: { id: 'account-A' },
    cloudReady: true,
    navigator: { onLine: online },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    },
    getScopedKey: () => 'portrait-dirty',
    portraitTombstoneKey: id => 'portrait-tombstone.' + id,
    loadPortrait: () => {
      calls.push('load');
      if (!delayLoad) return Promise.resolve(localPortrait);
      return new Promise(resolve => { releaseLoad = () => resolve(localPortrait); });
    },
    pushPortraitToCloud: async () => { calls.push('upload'); return pushResult; },
    deletePortraitFromCloud: async () => { calls.push('delete'); return deleteResult; }
  };
  vm.createContext(context);
  const fn = vm.runInContext('(() => { let portraitSyncInProgress = false; ' + helper + '; return syncPendingPortrait; })()', context);
  return { fn, calls, values, release: () => releaseLoad?.() };
}

(async () => {
  {
    const test = makePortraitSync({ localPortrait: { type: 'image/png' } });
    assert.equal(await test.fn(), true);
    assert.deepEqual(test.calls, ['load', 'upload'], 'a pending local portrait must be uploaded');
  }
  {
    const test = makePortraitSync({ localPortrait: null });
    assert.equal(await test.fn(), true);
    assert.deepEqual(test.calls, ['load', 'delete'], 'a deletion tombstone must cause remote portrait removal');
  }
  {
    const test = makePortraitSync({ online: false });
    assert.equal(await test.fn(), false);
    assert.deepEqual(test.calls, [], 'offline retry must not contact Storage');
    assert.equal(test.values.get('portrait-dirty'), '1', 'offline retry must preserve the pending marker');
  }
  {
    const test = makePortraitSync({ localPortrait: { type: 'image/png' }, pushResult: false });
    assert.equal(await test.fn(), false);
    assert.equal(test.values.get('portrait-dirty'), '1', 'failed upload must remain pending');
  }
  {
    const test = makePortraitSync({ localPortrait: null, deleteResult: false });
    assert.equal(await test.fn(), false);
    assert.equal(test.values.get('portrait-dirty'), '1', 'failed remote deletion must remain pending');
  }
  {
    const test = makePortraitSync({ localPortrait: { type: 'image/png' }, delayLoad: true });
    const first = test.fn();
    const second = await test.fn();
    assert.equal(second, false, 'a concurrent reconnect must not duplicate an in-flight portrait request');
    test.release();
    assert.equal(await first, true);
    assert.deepEqual(test.calls, ['load', 'upload'], 'portrait sync must be single-flight');
  }

  const bootstrap = extractBetween(sheet, 'async function bootstrapCloudForUser(user)', 'async function getCurrentProfile', 'cloud bootstrap');
  assert.ok(bootstrap.includes('await syncPendingPortrait();'), 'bootstrap must use the same retry path for pending portrait state');
  assert.ok(sheet.includes("if (!cloudReady) {\n      if (!bootstrapInProgress) void bootstrapCloudForUser(cloudUser);"),
    'reconnect must recover from a failed network bootstrap');
  assert.ok(sheet.includes("localStorage.setItem(getScopedKey('portraitDirty'),'1')"),
    'offline portrait requests must retain an account-scoped pending marker');

  console.log('CHRONUS v1.4.7 network recovery regression: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
