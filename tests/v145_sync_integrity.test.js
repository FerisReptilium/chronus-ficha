'use strict';

// Regression contracts for account isolation, interrupted writes, CAS conflicts,
// and destructive reset. These tests intentionally use source-level assertions:
// no production Supabase project or user data is contacted.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sheet = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');
const auth = fs.readFileSync('js/services/auth.js', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');
const config = fs.readFileSync('js/config.js', 'utf8');

function section(source, start, end, label) {
  const from = source.indexOf(start);
  assert(from >= 0, label + ': start marker must exist');
  const to = source.indexOf(end, from + start.length);
  assert(to > from, label + ': end marker must exist after start');
  return source.slice(from, to);
}

// 1) Storage keys must be disjoint across identities, including portrait and
// dirty/synced metadata. This evaluates the actual production config helpers.
{
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(config, sandbox, { filename: 'js/config.js' });
  const cfg = sandbox.window.CHRONUS_CONFIG;
  const users = ['player-A', 'player-B'];
  for (const key of ['getStorageKey', 'getCharacterIdKey', 'getDirtyKey', 'getSyncedKey', 'getPortraitDirtyKey']) {
    assert.notStrictEqual(cfg[key](users[0]), cfg[key](users[1]), key + ' must never share account storage keys');
    assert.ok(cfg[key](users[0]).includes(users[0]), key + ' must encode its owner');
    assert.ok(cfg[key](users[1]).includes(users[1]), key + ' must encode its owner');
  }
}

// 2) Legacy data is migratable only when unowned or owned by the same account.
// An account switch must replace the in-memory state with that account cache;
// the authenticated view is hidden while this is happening.
{
  const migration = section(
    sheet,
    'async function migrateLegacyStorageForUser(userId)',
    '// pushStateToCloud com retorno explícito',
    'account migration'
  );
  assert(migration.includes('(!localOwner || localOwner === userId)'), 'legacy cache migration must reject another account owner');
  assert(migration.includes('if (!isNarratorView && legacyData && !scopedData && (!localOwner || localOwner === userId))'), 'legacy sheet must not be copied across accounts');
  assert(migration.includes('const accountChanged = Boolean('), 'migration must detect a changed authenticated identity');
  assert(migration.includes('const accountState = normalizeState(mergeDeep(clone(defaultState), scopedState || {}));'), 'account switch must hydrate only the selected account cache');
  assert(migration.includes('Object.keys(state).forEach(key => delete state[key]);'), 'account switch must discard the previous in-memory sheet');
  assert(migration.includes('Object.assign(state, accountState);') && migration.includes('refreshAccountStateFromMemory();'), 'account switch must redraw controls from the new account state');
  assert(migration.includes('sessionStorage.setItem(ACTIVE_USER_SESSION_KEY, userId);'), 'active tab identity must be updated after migration');
  assert(!migration.includes('location.reload'), 'account migration must not trigger an intermediate reload');
  const authHandler = section(auth, 'async function notifyAuthListeners', 'function getPasswordRecoveryCallback', 'auth notification');
  assert(authHandler.includes('await Promise.all(pending)'), 'auth notification must await asynchronous account hydration');
  const sheetAuth = section(sheet, 'onAuthChange(async (user, profile) =>', 'return {', 'sheet auth handler');
  assert(sheetAuth.indexOf('setAccountHydrationPending(true)') < sheetAuth.indexOf('await migrateLegacyStorageForUser(user.id)'), 'sheet must be hidden before account migration begins');
  assert(router.includes("window.__CHRONUS_ACCOUNT_REHYDRATION_PENDING === true"), 'router must block private sheet rendering during account hydration');
}

// 3) Offline recovery retries only dirty writes, and never bypasses a conflict
// or incomplete cloud bootstrap.
{
  const reconnect = section(sheet, "window.addEventListener('offline'", 'function showAuthGate', 'network reconnect handlers');
  assert(reconnect.includes("window.addEventListener('online'"), 'online transition listener must exist');
  assert(reconnect.includes("if (!cloudReady || !cloudUser || !cloudCharacterId || cloudConflict) return;"), 'reconnect must stop for missing identity, bootstrap, or conflict');
  assert(reconnect.includes("localStorage.getItem(getScopedKey('dirty')) === '1'"), 'reconnect must retry only pending local writes');
  assert(reconnect.includes('scheduleCloudSave(500)'), 'reconnect must schedule a bounded retry rather than requiring another edit');
  const save = section(sheet, 'async function pushStateToCloud()', 'async function pushStateToCloudConfirmed()', 'automatic cloud save');
  assert(save.includes(".eq('user_id', cloudUser.id)"), 'cloud update must be scoped to authenticated owner');
  assert(save.includes(".eq('revision', cloudVersion)"), 'cloud update must use monotonic compare-and-swap');
  assert(save.includes("localStorage.setItem(getScopedKey('dirty'), '1')"), 'failed or stale writes must remain dirty');
  assert(save.includes("if (cloudConflict)"), 'automatic retry must not silently overwrite a conflict');
  assert(save.includes("setSaveStatus('Conflito de sincronização"), 'stale revision must be surfaced to the player');
}

// 4) A confirmed overwrite is explicit, rereads the latest revision, and still
// uses CAS. A stale second writer must be rejected and retained locally.
{
  const confirmed = section(sheet, 'async function pushStateToCloudConfirmed()', 'function showAuthGate', 'confirmed cloud save');
  assert(confirmed.includes('if (cloudConflict && !window.confirm('), 'conflict resolution must require explicit user confirmation');
  assert(confirmed.includes(".select('revision')"), 'overwrite must read the current remote revision');
  assert(confirmed.includes(".eq('revision', expectedVersion)"), 'confirmed overwrite must still use CAS');
  assert(confirmed.includes('if (data?.revision == null)'), 'zero-row CAS result must be treated as a conflict');
  assert(confirmed.includes("localStorage.setItem(dirtyKey, '1')"), 'failed confirmed write must preserve dirty local data');
  assert(confirmed.includes('return { ok: true, revision: cloudVersion }'), 'success must return the server-confirmed revision');
}

// 5) Destructive reset must be online, hydrated, explicitly confirmed, and must
// report partial failure instead of claiming the cloud was cleaned.
{
  const actions = section(sheet, 'function setupActions()', 'function registerSW()', 'sheet reset action');
  const offlineGuard = actions.indexOf("if(cloudUser && !navigator.onLine)");
  const readyGuard = actions.indexOf('if(cloudUser && !cloudReady)');
  const confirmation = actions.indexOf("if(typed!=='LIMPAR') return;");
  const localClear = actions.indexOf('const localPortraitClearOk = await clearPortrait();');
  const remotePortrait = actions.indexOf('portraitSyncOk = await deletePortraitFromCloud();');
  const remoteSheet = actions.indexOf('const syncResult = await pushStateToCloudConfirmed();');
  const failure = actions.indexOf('if(!localPortraitClearOk || !cloudSyncOk || !portraitSyncOk)');
  const success = actions.indexOf("alert(cloudUser ? 'Ficha e retrato removidos da nuvem com confirmação.'");
  assert(offlineGuard >= 0 && readyGuard > offlineGuard, 'reset must reject offline and uninitialized cloud sessions');
  assert(confirmation > readyGuard, 'reset must require typed confirmation after connectivity guards');
  assert(localClear > confirmation, 'local reset must happen only after explicit confirmation');
  assert(remotePortrait > localClear && remoteSheet > remotePortrait, 'remote cleanup must follow local reset in deterministic order');
  assert(failure > remoteSheet && success > failure, 'partial failure must be handled before any success message');
  assert(actions.includes("localStorage.setItem(getScopedKey('portraitDirty'),'1')"), 'portrait deletion must remain retryable');
  const portrait = section(sheet, 'async function deletePortraitFromCloud()', 'function showAuthGate', 'portrait deletion');
  assert(portrait.includes("localStorage.setItem(getScopedKey('portraitDirty'),'1')"), 'failed remote portrait removal must persist pending state');
  const bootstrap = section(sheet, 'async function bootstrapCloudForUser(user)', 'async function getCurrentProfile', 'cloud bootstrap');
  assert(bootstrap.includes("const portraitDirty = localStorage.getItem(getScopedKey('portraitDirty')) === '1'"), 'bootstrap must detect pending portrait deletion');
  assert(bootstrap.includes('else await deletePortraitFromCloud();'), 'bootstrap must retry deletion when the local portrait is absent');
}

// 6) Logout must not discard pending changes when cloud confirmation or sign-out
// fails. The local account cache remains available after a successful sign-out.
{
  const logout = section(auth, 'async function handleLogout()', 'function showAuthModal', 'secure logout');
  assert(logout.includes("isDirty || dirtyKeyVal === '1'"), 'logout must detect pending writes');
  assert(logout.includes('if (!syncResult || !syncResult.ok)'), 'logout must stop when cloud synchronization is unconfirmed');
  assert(logout.includes("if (signOutError) throw signOutError;"), 'logout must surface Supabase sign-out errors');
  assert(logout.includes('preservando o cache local individual do usuário'), 'logout must preserve account-scoped local cache');
}

console.log('CHRONUS v1.4.5 sync integrity regression: PASS');
