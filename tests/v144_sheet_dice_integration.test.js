'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');

const diceSource = fs.readFileSync('js/modules/dice_roller_v135.js', 'utf8');
const sheetSource = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');
const css = fs.readFileSync('css/dice-roller-v135.css', 'utf8');

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
assert(sheetSource.includes('const anonymousPortrait = !localOwner ? await dbGet(portraitStorageKey(null))'), 'anonymous portraits must migrate only to the first authenticated owner');
assert(sheetSource.includes('const fallback=localStorage.getItem(portraitFallbackKey(userId))'), 'portrait fallback must load even when IndexedDB is available but has no scoped record');
assert(sheetSource.includes("dbGet('portrait')"), 'legacy portrait may only be read through the explicit migration path');
assert(sheetSource.includes('async function migrateLegacyStorageForUser(userId)'), 'account migration must await legacy portrait isolation');
assert(sheetSource.includes("if (localOwner && localOwner !== userId)"), 'every account switch must force a clean rehydration even without a scoped cache');
assert(sheetSource.includes('if (await migrateLegacyStorageForUser(user.id))'), 'auth bootstrap must wait for account-scoped cache and portrait migration');
assert(sheetSource.includes('saveTimer = 0;'), 'completed debounce must clear the pending-save marker');
assert(sheetSource.includes('cloudSaveTimer = 0; pushStateToCloud();'), 'completed cloud debounce must clear the pending-sync marker');
assert(sheetSource.includes('if (saveTimer) {\n      clearTimeout(saveTimer);\n      saveTimer = 0;\n      persistLocalState(true);'), 'logout sync must flush pending edits to account-scoped local storage');
assert(sheetSource.includes('if (cloudSaving) {\n      return { ok: false'), 'logout must not race an in-flight automatic cloud save');
assert(sheetSource.includes('Boolean(saveTimer || cloudSaveTimer || cloudSaving || localStorage.getItem(dirtyKey) === \'1\')'), 'dirty detection must include pending debounce timers and in-flight saves');
assert(sheetSource.includes('const legacyRaw = ownerId ? null'), 'loadState must not fall back to a global legacy cache when an account owner is already known');
assert(sheetSource.includes('let migratedLegacyCache = false'), 'legacy cache migration must track whether a reload is required');
assert(sheetSource.includes('migratedLegacyCache || (scopedData && localOwner !== userId)'), 'a newly migrated legacy cache must trigger controlled rehydration before rendering');
assert(sheetSource.includes('cfg.getStorageKey(userId)'), 'remote snapshots must persist to the account-scoped cache');
assert(sheetSource.includes('cfg.getDirtyKey(userId)'), 'remote dirty flags must be account-scoped');
assert(sheetSource.includes('cfg.getSyncedKey(userId)'), 'remote sync timestamps must be account-scoped');
assert(sheetSource.includes('cfg.getPortraitDirtyKey(userId)'), 'portrait dirty state must be account-scoped');
assert(sheetSource.includes('(!localOwner || localOwner === userId)'), 'legacy cache migration must not copy another account cache');
assert(sheetSource.includes('migratedLegacyCache || (scopedData && localOwner !== userId)'), 'switching accounts must restore that account own local cache and reload after legacy migration');
assert(sheetSource.includes('if (migrateLegacyStorageForUser(user.id))'), 'switching account caches must trigger a controlled reload before rendering');
assert(sheetSource.includes('localOwner && localOwner !== user.id && !dirty'), 'switching accounts must not discard a pending draft with a valid base');
assert(sheetSource.includes('const fresh=normalizeState(clone(defaultState))'), 'reset must initialize calculated resource state');
