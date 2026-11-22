'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');

function section(start, end, label) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, label + ': start marker missing');
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, label + ': end marker missing');
  return source.slice(from, to);
}

const backupHelpers = section(
  '  // Ficha: cópia de segurança por identidade',
  '  function portraitOwnerId()',
  'IndexedDB sheet backup helpers'
);
const persistHelper = section(
  '  function persistLocalState(markDirty=true) {',
  '\n  function scheduleCloudSave',
  'local persistence helper'
);

function createHarness({ quota = false, indexedDb = true, initialState = { identity: { name: 'A' }, notes: 'initial' }, userId = 'user-A' } = {}) {
  const records = new Map();
  const values = new Map();
  const calls = [];
  const sandbox = {
    state: structuredClone(initialState),
    defaultState: { identity: {}, notes: '' },
    STORAGE_KEY: 'chronus.sheet.v4',
    CLOUD_DIRTY_KEY: 'chronus.cloud.dirty.v1',
    CLOUD_USER_KEY: 'chronus.cloud.user.v1',
    ACTIVE_USER_SESSION_KEY: 'chronus.session.user',
    cloudUser: userId ? { id: userId } : null,
    window: { CHRONUS_CONFIG: {
      getStorageKey: id => 'chronus.sheet.user.' + id,
      getDirtyKey: id => 'chronus.dirty.user.' + id
    } },
    sessionStorage: { getItem: key => key === 'chronus.session.user' ? userId : null },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => {
        if (quota && key.startsWith('chronus.sheet.user.')) {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        values.set(key, String(value));
      }
    },
    dbPut: async (value, key) => {
      if (!indexedDb) throw new Error('IndexedDB unavailable');
      records.set(key, structuredClone(value));
    },
    dbGet: async key => {
      if (!indexedDb) throw new Error('IndexedDB unavailable');
      return records.has(key) ? structuredClone(records.get(key)) : null;
    },
    clone: value => JSON.parse(JSON.stringify(value)),
    mergeDeep: (base, extra) => ({ ...base, ...extra }),
    normalizeState: value => value,
    setSaveStatus: (message, mode) => calls.push({ message, mode }),
    console: { warn: () => {}, error: () => {} },
    Date,
    Promise,
    Set,
    JSON,
    structuredClone
  };
  vm.createContext(sandbox);
  vm.runInContext(backupHelpers, sandbox);
  vm.runInContext(persistHelper, sandbox);
  return { sandbox, records, values, calls };
}

(async () => {
  // Quota failure: state must be durably backed up in IndexedDB and remain dirty.
  {
    const h = createHarness({ quota: true });
    const saved = vm.runInContext('persistLocalState(true)', h.sandbox);
    assert.equal(saved, false, 'localStorage quota failure must not be reported as a normal local save');
    await h.sandbox.window.__chronusSheetBackupWrite;
    const record = h.records.get('sheet.state.user-A');
    assert.ok(record, 'IndexedDB backup must exist after localStorage quota failure');
    assert.equal(record.owner, 'user-A', 'backup must be account-scoped');
    assert.equal(record.dirty, true, 'backup must retain pending synchronization state');
    assert.equal(record.state.notes, 'initial', 'backup must preserve the complete sheet');
    assert.ok(h.calls.some(x => /Ficha protegida no armazenamento local alternativo/.test(x.message)),
      'successful fallback must be reported clearly');
  }

  // IndexedDB unavailable too: do not claim persistence; explain the recovery risk.
  {
    const h = createHarness({ quota: true, indexedDb: false });
    vm.runInContext('persistLocalState(true)', h.sandbox);
    await h.sandbox.window.__chronusSheetBackupWrite.catch(() => {});
    assert.equal(h.records.size, 0, 'no backup may be claimed when IndexedDB is unavailable');
    assert.ok(h.calls.some(x => /não feche esta página e exporte seus dados/.test(x.message)),
      'double storage failure must display an explicit warning');
    assert.equal(h.sandbox.state.notes, 'initial', 'in-memory state must remain intact after both storage failures');
  }

  // Reload recovery: a newer IndexedDB snapshot replaces an older local cache.
  {
    const h = createHarness({ quota: true });
    h.sandbox.state.notes = 'latest-before-reload';
    vm.runInContext('persistLocalState(true)', h.sandbox);
    await h.sandbox.window.__chronusSheetBackupWrite;

    // Reuse the exact production helper block with a fresh in-memory state.
    const restoreContext = {
      state: { identity: {}, notes: 'stale-default' },
      defaultState: { identity: {}, notes: '' },
      STORAGE_KEY: 'chronus.sheet.v4',
      CLOUD_DIRTY_KEY: 'chronus.cloud.dirty.v1',
      CLOUD_USER_KEY: 'chronus.cloud.user.v1',
      ACTIVE_USER_SESSION_KEY: 'chronus.session.user',
      cloudUser: { id: 'user-A' },
      window: { CHRONUS_CONFIG: { getDirtyKey: id => 'chronus.dirty.user.' + id } },
      localStorage: { getItem: key => h.values.get(key) ?? null, setItem: (key, value) => h.values.set(key, String(value)) },
      sessionStorage: { getItem: () => 'user-A' },
      dbPut: async (value, key) => h.records.set(key, structuredClone(value)),
      dbGet: async key => h.records.has(key) ? structuredClone(h.records.get(key)) : null,
      clone: value => JSON.parse(JSON.stringify(value)),
      mergeDeep: (base, extra) => ({ ...base, ...extra }),
      normalizeState: value => value,
      console: { warn: () => {}, error: () => {} },
      Date, Promise, Set, JSON, structuredClone
    };
    vm.createContext(restoreContext);
    vm.runInContext(backupHelpers, restoreContext);
    assert.equal(await vm.runInContext('restoreInitialSheetBackup()', restoreContext), true);
    assert.equal(restoreContext.state.notes, 'latest-before-reload', 'reload must restore the newest account backup');
    assert.ok(restoreContext.sheetBackupDirtyUsers.has('user-A'), 'recovered unsynced data must remain marked dirty');
  }

  // Account isolation: user A's record must never be returned under user B's key.
  {
    const h = createHarness({ quota: true, userId: 'user-A' });
    vm.runInContext('persistLocalState(true)', h.sandbox);
    await h.sandbox.window.__chronusSheetBackupWrite;
    const own = await h.sandbox.dbGet('sheet.state.user-A');
    const other = await h.sandbox.dbGet('sheet.state.user-B');
    assert.equal(own.owner, 'user-A');
    assert.equal(other, null, 'another account must not read the first account backup');
  }

  // A save acknowledged remotely must not clear a newer in-memory edit.
  {
    const h = createHarness({ quota: true });
    const snapshot = JSON.stringify(h.sandbox.state);
    await vm.runInContext('saveSheetBackup("user-A", ' + JSON.stringify(JSON.stringify({ identity: { name: 'A' }, notes: 'initial' })) + ', true)', h.sandbox);
    h.sandbox.state.notes = 'newer-edit';
    const cleared = await vm.runInContext('markSheetBackupSynced("user-A", ' + JSON.stringify(snapshot) + ')', h.sandbox);
    assert.equal(cleared, false, 'stale cloud acknowledgement must not clear dirty state for a newer edit');
    assert.equal(h.records.get('sheet.state.user-A').dirty, true, 'newer edit must remain pending in the backup');
  }

  // Production migration must hydrate only the authenticated user's backup.
  const migration = section(
    'async function migrateLegacyStorageForUser(userId)',
    '// pushStateToCloud com retorno explícito',
    'account-scoped backup migration'
  );
  assert.ok(migration.includes('readSheetBackup(userId)'), 'account migration must request the authenticated user backup');
  assert.ok(migration.includes('backupRecord.savedAt > localSavedAt'), 'backup must replace only an older or missing local cache');
  assert.ok(migration.includes('restoredFromBackup'), 'restoration must trigger account-state rehydration');
  assert.ok(migration.includes('Boolean(anonymousBackup)'), 'anonymous backup must not leak into an authenticated account when local metadata is unavailable');
  assert.ok(backupHelpers.includes("record.owner !== (userId || 'anonymous')"), 'backup reader must validate its owner');
  assert.ok(backupHelpers.includes('if (JSON.stringify(state) !== snapshot) return false;'), 'stale cloud acknowledgement must not clear newer edits');

  console.log('CHRONUS v1.4.8 storage resilience regression: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
