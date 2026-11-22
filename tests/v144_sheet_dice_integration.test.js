'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');

const diceSource = fs.readFileSync('js/modules/dice_roller_v135.js', 'utf8');
const sheetSource = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');
const authSource = fs.readFileSync('js/services/auth.js', 'utf8');
const routerSource = fs.readFileSync('js/router.js', 'utf8');
const css = fs.readFileSync('css/dice-roller-v135.css', 'utf8');

const mergeDeepStart = sheetSource.indexOf('function mergeDeep(target, source) {');
const mergeDeepEnd = sheetSource.indexOf('function normalizeState(s)', mergeDeepStart);
assert(mergeDeepStart >= 0 && mergeDeepEnd > mergeDeepStart, 'mergeDeep implementation must remain available for security regression coverage');
const mergeDeepSource = sheetSource.slice(mergeDeepStart, mergeDeepEnd);
const mergeDeep = vm.runInNewContext(`(() => { ${mergeDeepSource}; return mergeDeep; })()`);
const hostileSheetData = JSON.parse('{"profile":{"name":"safe"},"__proto__":{"polluted":true},"prototype":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
const mergedSheetData = mergeDeep({}, hostileSheetData);
assert.strictEqual(mergedSheetData.profile.name, 'safe', 'safe sheet properties must still merge');
assert.strictEqual(Object.prototype.polluted, undefined, 'hostile sheet JSON must not pollute the host object prototype');
assert(!Object.prototype.hasOwnProperty.call(mergedSheetData, '__proto__'), 'prototype setter payload must be rejected');
assert(!Object.prototype.hasOwnProperty.call(mergedSheetData, 'prototype'), 'prototype key must be rejected');
assert(!Object.prototype.hasOwnProperty.call(mergedSheetData, 'constructor'), 'constructor key must be rejected');

for (const marker of [
  'Atributo da ficha',
  'Personalidade',
  'Habilidade',
  'Ficha conectada',
  'dice-guided-action',
  'dice-paradox-sheet-status'
]) {
  assert(diceSource.includes(marker), `sheet integration UI marker missing: ${marker}`);
}

for (const api of ['getRollProfile', 'spendDetermination', 'dischargeParadox']) {
  assert(sheetSource.includes(api), `sheet resource API missing: ${api}`);
}

assert(sheetSource.includes("['d4','d6','d8','d10','d12']"), 'attributes must support d12');
assert(sheetSource.includes("determination: Math.min(sides('Perseverança'), sides('Vontade'))"), 'Determination maximum must use the lower Perseverance/Will die');
assert(sheetSource.includes("wounds: 5 + sides('Vigor')"), 'Wounds maximum must be 5 plus Vigor die');
assert(sheetSource.includes("d4:10,d6:15,d8:25,d10:40,d12:60"), 'Mana maximum must follow the Illumination table');
assert(sheetSource.includes(".filter(attribute => [4, 6, 8, 10, 12].includes(attribute.sides))"), 'd12 attributes must reach the dice roller');
assert(sheetSource.includes("renderResourceCounter(host, 'determination'"), 'Determination must use a dynamic counter');
assert(sheetSource.includes("renderResourceCounter(host, 'mana'"), 'Mana must use a dynamic counter');
assert(sheetSource.includes("renderResourceCounter(host, 'wounds'"), 'Wounds must use a dynamic counter');
assert(sheetSource.includes('updateResourceCounters();'), 'resource counters must refresh after derived maxima change');
assert(sheetSource.includes('state.resources.determination -= 1'), 'Determination must be consumed from the dynamic resource counter');
assert(!sheetSource.includes('phxqtkdumgwacrqsflqe.supabase.co'), 'sheet engine must not retain obsolete Supabase project endpoint');
assert(!sheetSource.includes('sb_publishable_nl4ksY4d4ZFWENQ1_93wQQ_MXHih6uK'), 'sheet engine must not retain obsolete Supabase publishable key');
assert(sheetSource.includes(".eq('updated_at', cloudVersion)"), 'cloud writes must use optimistic concurrency against the per-tab version');
assert(sheetSource.includes(".maybeSingle()"), 'a stale cloud write must be detectable as a zero-row update');
assert(sheetSource.includes('cloudConflict = true'), 'a stale cloud write must enter explicit conflict state');
assert(sheetSource.includes("Conflito de sincronização"), 'sync conflicts must be surfaced instead of silently overwriting');
assert(sheetSource.includes("localStorage.setItem(getScopedKey('dirty'), '1')"), 'conflicting local edits must remain marked dirty in the active account cache');

assert(sheetSource.includes('state.paradox = next'), 'Paradox discharge must update the sheet state');
assert(sheetSource.includes("new CustomEvent('chronus:sheet-updated')"), 'sheet changes must notify the roller');
assert(diceSource.includes('window.confirm(`Consumir 1 ponto de Determinação'), 'Determination consumption must require confirmation');
assert(diceSource.includes('window.confirm(`Liberar a Descarga de Paradoxo'), 'Paradox discharge must require confirmation');
assert(diceSource.includes("option.textContent = String(getLabel(item))"), 'sheet option labels must use safe text rendering');
assert(!diceSource.includes('${item.name}</option>'), 'sheet-controlled names must not be interpolated into option HTML');
assert(css.includes('.dice-sheet-grid'), 'responsive sheet selector layout missing');

const context = { window: { crypto: webcrypto } };
vm.createContext(context);
vm.runInContext(diceSource, context);
const engine = context.window.ChronusDiceRollerV135.engine;

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(engine.buildGuidedSpec({
    kind: 'normal',
    action: 'Investigar o bunker',
    sides: 10,
    baseDifficulty: 5,
    adjustment: 1,
    determination: true,
    attributeName: 'Razão',
    personality: 'Analítico',
    skill: 'Investigação',
    characterName: 'Mara'
  }))),
  {
    mode: 'Teste guiado',
    kind: 'normal',
    title: 'Investigar o bunker',
    sides: 10,
    count: 3,
    baseDifficulty: 5,
    adjustment: 1,
    difficulty: 6,
    determination: true,
    attributeName: 'Razão',
    personality: 'Analítico',
    skill: 'Investigação',
    characterName: 'Mara'
  }
);

const attributeOnly = engine.buildGuidedSpec({ kind: 'combat', sides: 6, baseDifficulty: 4 });
assert.strictEqual(attributeOnly.count, 1, 'attribute alone must roll one die');
assert.strictEqual(attributeOnly.title, 'Ataque ou defesa');

const d12Attribute = engine.buildGuidedSpec({ kind: 'normal', sides: 12, baseDifficulty: 7 });
assert.strictEqual(d12Attribute.sides, 12, 'd12 must be supported as an Attribute die');
assert.strictEqual(d12Attribute.difficulty, 7, 'difficulty must remain within canonical 4–7 range');

const oneSource = engine.buildGuidedSpec({ kind: 'normal', sides: 8, baseDifficulty: 6, adjustment: -2, skill: 'Ocultismo' });
assert.strictEqual(oneSource.count, 2, 'one applicable source must add exactly one die');
assert.strictEqual(oneSource.difficulty, 4, 'situation adjustment must calculate final difficulty');

console.log('v1.4.4 sheet-to-dice integration regression: PASS');

assert(sheetSource.includes("localStorage.setItem(conflictKey, '1')"), 'conflict state must survive reloads and other tabs');
assert(sheetSource.includes('window.confirm('), 'overwriting a newer remote version must require explicit confirmation');

assert(sheetSource.includes("event.key.startsWith(CLOUD_CONFLICT_KEY"), 'conflict state must propagate across open tabs');

assert(sheetSource.includes('sessionStorage.getItem(baseKey)'), 'dirty local drafts must retain their per-tab base version across reloads');
assert(sheetSource.includes('localBaseVersion !== cloudVersion'), 'bootstrap must block drafts based on an older remote version');
assert(sheetSource.includes('getStorageKey(ownerId)'), 'loadState must restore the active account cache');
assert(sheetSource.includes('function portraitStorageKey(userId=portraitOwnerId())'), 'portrait IndexedDB keys must be scoped to the active account');
assert(sheetSource.includes('function portraitFallbackKey(userId=portraitOwnerId())'), 'portrait localStorage fallback must be scoped to the active account');
assert(sheetSource.includes("if(!userId && !localStorage.getItem(CLOUD_USER_KEY))"), 'logged-out visitors must not load a previous account legacy portrait');
assert(sheetSource.includes('const anonymousPortrait = !localOwner && !legacyPortraitDeleted ? await dbGet(portraitStorageKey(null))') && sheetSource.includes('const anonymousFallback = !localOwner && !legacyPortraitDeleted ? localStorage.getItem(portraitFallbackKey(null))'), 'anonymous portraits and fallbacks must migrate only to the first authenticated owner and never after an explicit deletion');
assert(sheetSource.includes('const fallback=localStorage.getItem(portraitFallbackKey(userId))'), 'portrait fallback must load even when IndexedDB is available but has no scoped record');
assert(sheetSource.includes("if(!userId && !localStorage.getItem(CLOUD_USER_KEY))"), 'legacy portrait must never leak into a browser already associated with an account');
assert(sheetSource.includes("dbGet('portrait')"), 'legacy portrait may only be read through the explicit migration path');
assert(sheetSource.includes('async function migrateLegacyStorageForUser(userId)'), 'account migration must await legacy portrait isolation');
assert(sheetSource.includes('const accountChanged = Boolean('), 'an existing account switch must be detected before loading private cache');
assert(sheetSource.includes('await migrateLegacyStorageForUser(user.id)'), 'auth bootstrap must await account-scoped cache and portrait migration without an intermediate reload');
assert(sheetSource.includes('saveTimer = 0;'), 'completed debounce must clear the pending-save marker');
assert(sheetSource.includes('cloudSaveTimer = 0; pushStateToCloud();'), 'completed cloud debounce must clear the pending-sync marker');
assert(sheetSource.includes('if (saveTimer) {\n      clearTimeout(saveTimer);\n      saveTimer = 0;\n      persistLocalState(true);'), 'logout sync must flush pending edits to account-scoped local storage');
assert(sheetSource.includes('if (cloudSaving) {\n      return { ok: false'), 'logout must not race an in-flight automatic cloud save');
assert(sheetSource.includes('Boolean(saveTimer || cloudSaveTimer || cloudSaving || localStorage.getItem(dirtyKey) === \'1\')'), 'dirty detection must include pending debounce timers and in-flight saves');
assert(sheetSource.includes('const legacyRaw = (!knownOwner && !ownerId)'), 'logged-out or switched accounts must not fall back to a previous account legacy cache');
assert(sheetSource.includes('let migratedLegacyCache = false'), 'legacy cache migration must track whether a reload is required');

assert(sheetSource.includes('(cfg.LEGACY_KEYS || [cfg.LEGACY_STORAGE_KEY])'), 'all supported legacy sheet versions must be migrated into the account cache');
assert(sheetSource.includes("localOwner === userId ? localStorage.getItem(CLOUD_DIRTY_KEY) === '1' : true"), 'unowned legacy drafts must remain dirty until the server confirms their adoption');
assert(sheetSource.includes('if (accountChanged) {') && sheetSource.includes('const accountState = normalizeState(mergeDeep(clone(defaultState), scopedState || {}));'), 'account changes must replace in-memory state with only the authenticated account cache');
const migrationSource = sheetSource.slice(sheetSource.indexOf('async function migrateLegacyStorageForUser'), sheetSource.indexOf('// pushStateToCloud com retorno explícito'));
assert(migrationSource.includes('const accountChanged = Boolean(') && migrationSource.includes('(!activeSessionUser && scopedData)'), 'first-time accounts must be distinguished from sessions with a prior scoped cache');
assert(!migrationSource.includes('location.reload') && migrationSource.includes('return false;'), 'account cache migration must not trigger an intermediate reload');
assert(sheetSource.includes('cfg.getStorageKey(userId)'), 'remote snapshots must persist to the account-scoped cache');
assert(sheetSource.includes('cfg.getDirtyKey(userId)'), 'remote dirty flags must be account-scoped');
assert(sheetSource.includes('cfg.getSyncedKey(userId)'), 'remote sync timestamps must be account-scoped');
assert(sheetSource.includes('cfg.getPortraitDirtyKey(userId)'), 'portrait dirty state must be account-scoped');
assert(sheetSource.includes('(!localOwner || localOwner === userId)'), 'legacy cache migration must not copy another account cache');
assert(sheetSource.includes('setAccountHydrationPending(false)'), 'cloud bootstrap must release protected routes and restore sheet visibility after account hydration');
assert(sheetSource.includes('await migrateLegacyStorageForUser(user.id)'), 'switching account caches must hydrate in memory before cloud bootstrap');
assert(sheetSource.includes('localOwner && localOwner !== user.id && !dirty'), 'switching accounts must not discard a pending draft with a valid base');
assert(sheetSource.includes('const fresh=normalizeState(clone(defaultState))'), 'reset must initialize calculated resource state');

assert(sheetSource.includes("sessionStorage.getItem(ACTIVE_USER_SESSION_KEY)"), 'private sheet cache must require an authenticated tab session');
assert(sheetSource.includes("const authResolved = window.ChronusAuth?.isInitialized?.() === true;") && sheetSource.includes('if (authResolved) {\n          sessionStorage.removeItem(ACTIVE_USER_SESSION_KEY);'), 'initial null auth callback must not clear a valid session before getSession resolves');
assert(sheetSource.includes("sessionStorage.removeItem(ACTIVE_USER_SESSION_KEY)"), 'sign-out must revoke access to the account-scoped cache in this tab');
assert(authSource.includes('function isInitialized() { return authInitialized; }'), 'auth service must expose a reliable initialization boundary');
assert(authSource.includes('async function notifyAuthListeners(user, profile)'), 'auth bootstrap must await asynchronous listeners');
assert(authSource.includes('if (stateKey === lastNotifiedAuthState) return;'), 'duplicate SIGNED_IN and explicit login notifications must not race cache hydration');
assert(authSource.includes('await notifyAuthListeners(currentUser, currentProfile)'), 'initial authenticated session must wait for sheet hydration before routing');
assert(sheetSource.includes('setAccountHydrationPending(true)') && sheetSource.includes('window.__CHRONUS_ACCOUNT_REHYDRATION_PENDING = Boolean(pending)'), 'account cache migration must expose a pending hydration guard through the visibility helper');
assert(routerSource.includes("cleanHash === '#/sheet' && window.__CHRONUS_ACCOUNT_REHYDRATION_PENDING === true"), 'router must not render a previous account sheet during rehydration');

assert(sheetSource.includes("const syncResult = await pushStateToCloudConfirmed()"), 'reset must verify cloud confirmation instead of trusting an automatic save');
assert(sheetSource.includes("if(!cloudSyncOk || !portraitSyncOk)"), 'reset must report partial cloud deletion without claiming full success');
assert(sheetSource.includes("localStorage.setItem(getScopedKey('portraitDirty'),'1')"), 'failed portrait deletion must remain pending for retry');
assert(sheetSource.includes('else await deletePortraitFromCloud();'), 'bootstrap must retry a pending portrait deletion when no local portrait remains');
assert(routerSource.includes("'#/sheet': { viewId: 'view-sheet', title: 'Ficha Digital · CHRONUS', authRequired: true }"), 'private character sheet route must require an authenticated user');

assert(sheetSource.includes('legacy === 3 ? initialDetermination : legacy'), 'a fully filled legacy Determination pool must expand to the new derived maximum');
assert(sheetSource.includes('legacy === manaKeys.length ? initialMana : legacy'), 'a fully filled legacy Mana pool must expand to the new Illumination maximum');
assert(sheetSource.includes('if (authResolved) {\n          sessionStorage.removeItem(ACTIVE_USER_SESSION_KEY);'), 'narrator view snapshot must survive the pre-authentication listener callback');

assert(authSource.includes('const { error: signOutError } = await client.auth.signOut();') && authSource.includes('if (signOutError) throw signOutError;'), 'logout must not claim success when Supabase returns a sign-out error');

assert(sheetSource.includes('function refreshAccountStateFromMemory()'), 'account switching must rehydrate the rendered form in memory');
assert(sheetSource.includes("document.getElementById(id)?.replaceChildren()"), 'account switching must clear dynamic layers before rebuilding controls');
assert(sheetSource.includes('window.__chronusClearPortrait = clear'), 'account switching must clear the previous account portrait');
assert(sheetSource.includes('setAccountHydrationPending(false)'), 'narrator and player bootstrap must release the protected sheet route and restore sheet visibility');
assert(sheetSource.includes('function setAccountHydrationPending(pending)'), 'private sheet must be hidden during account hydration');
assert(sheetSource.includes("sheet.style.visibility = pending ? 'hidden' : '';"), 'account hydration must prevent visual exposure of the previous account sheet');
assert(sheetSource.includes('setAccountHydrationPending(true);\n        if (await migrateLegacyStorageForUser(user.id))'), 'authentication must block the sheet before awaiting account migration');
assert(sheetSource.includes('setAccountHydrationPending(hadAuthenticatedCache)'), 'resolved signed-out sessions must release stale sheet visibility while revoking account cache');
assert(sheetSource.includes("if (k === '__proto__' || k === 'prototype' || k === 'constructor') return;"), 'untrusted sheet JSON must not be able to pollute object prototypes');

assert(sheetSource.includes("const isNarratorView = new URLSearchParams(location.search).get('narratorView') === '1';"), 'narratorView must be detected before account cache rehydration');
assert(sheetSource.includes('if (accountChanged && !isNarratorView)'), 'account cache changes must not overwrite the narrator-selected character snapshot');
assert(sheetSource.includes('if (!isNarratorView) {\n        const accountPortrait'), 'narratorView must load the selected player portrait, not the narrator account portrait');
assert(sheetSource.includes("if (!isNarratorView && legacyData && !scopedData"), 'narrator view must not migrate an anonymous player sheet into the narrator account');
assert(sheetSource.includes("if (!isNarratorView && (!localOwner || localOwner === userId))"), 'narrator view must not migrate anonymous portrait data into the narrator account');
assert(sheetSource.includes("if (isNarratorView && !activeSessionUser)"), 'first-time narrator view must reload after establishing the authenticated session so its snapshot is loaded');
assert(sheetSource.includes("const illumination = String(s.illumination || 'd4').toLowerCase()"), 'legacy or malformed Illumination values must normalize before Mana maximum calculation');
assert(sheetSource.includes("const hasValidResourceValue = value => ("), 'malformed null or blank resource values must use derived defaults instead of silently becoming zero');
assert(sheetSource.includes('Math.floor(Number(s.resources.determination))') && sheetSource.includes('Math.floor(Number(s.resources.mana))') && sheetSource.includes('Math.floor(Number(s.resources.wounds))'), 'resource counters must normalize persisted values to whole numbers');
assert(sheetSource.includes("if (!s || typeof s !== 'object' || Array.isArray(s)) s = clone(defaultState);"), 'invalid root sheet payloads must normalize to a safe default shape');
assert(sheetSource.includes("if (!s.lists || typeof s.lists !== 'object' || Array.isArray(s.lists)) s.lists = clone(defaultState.lists);"), 'malformed list containers must not crash the sheet renderer');
assert(sheetSource.includes("s.lists.equipment.slice(0,4).map(item => ({"), 'malformed equipment rows must normalize before rendering');
assert(sheetSource.includes("s.page2.formulas = s.page2.formulas.slice(0,12).map(value => String(value ?? ''));"), 'page two collections must normalize to bounded string arrays');
assert(sheetSource.includes("narratorReadOnly = false;\n    document.querySelectorAll('.workspace input,.workspace textarea,.workspace select,.workspace button')"), 'player account must regain editable controls after narrator read-only mode');
assert(sheetSource.includes('async function dataUrlToBlob(dataUrl)'), 'portrait fallback data URLs must be converted to Blob before Storage upload');
assert(sheetSource.includes('const fallback=localStorage.getItem(portraitFallbackKey(userId));\n    if(fallback){'), 'latest local portrait fallback must take precedence over an older IndexedDB record');
assert(sheetSource.includes('if (!scopedFallback && legacyFallback)'), 'legacy portrait fallback must migrate even when an older IndexedDB portrait exists');
assert(sheetSource.includes('|| migratedLegacyPortrait'), 'migrated portrait data must refresh the active account portrait preview');
assert(sheetSource.includes("preview.hidden=true;input.value='';button.classList.remove('has-portrait')"), 'account switch must clear a previously selected local portrait file');
assert(sheetSource.includes('function portraitTombstoneKey(userId=portraitOwnerId())'), 'deleted portrait tombstones must prevent stale IndexedDB images from reappearing');
assert(sheetSource.includes("localStorage.getItem(portraitTombstoneKey(userId))==='1'"), 'portrait reads must honor deletion tombstones before IndexedDB fallback');
assert(sheetSource.includes('const localPortraitClearOk = await clearPortrait()'), 'reset must verify local portrait deletion as well as remote deletion');
assert(sheetSource.includes("if(localStorage.getItem(portraitTombstoneKey('legacy'))==='1')"), 'legacy portrait deletion tombstones must suppress old global IndexedDB records');
assert(sheetSource.includes("localStorage.setItem(portraitTombstoneKey('legacy'), '1')"), 'migrated legacy portraits must no longer be visible through anonymous storage');
assert(sheetSource.includes("if (!localOwner) localStorage.setItem(cfg.getPortraitDirtyKey(userId), '1')"), 'unowned legacy portraits must be uploaded to the first authenticated account instead of being silently overwritten');