'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');

const read = path => fs.readFileSync(path, 'utf8');
const app = read('js/app.js');
const source = read('js/modules/dice_roller_v135.js');
const css = read('css/dice-roller-v135.css');

assert(app.includes("loadScriptOnce('js/modules/dice_roller_v135.js')"), 'dice roller module must load from bootstrap');
assert(source.includes('const DIE_SIDES = [4, 6, 8, 10, 12]'), 'approved CHRONUS dice set missing');
assert(source.includes('window.crypto.getRandomValues'), 'roller must use Web Crypto randomness');
const narrativeRules = read('js/rules/narrative_resolution.js');
assert(app.includes("loadScriptOnce('js/rules/narrative_resolution.js')"), 'canonical narrative rules must load before the roller');
assert(app.includes("loadScriptOnce('js/services/narrative_live.js')"), 'live synchronization service must load from bootstrap');
assert(narrativeRules.includes("exceptional_success"), 'exceptional success outcome missing');
assert(narrativeRules.includes("partial_success"), 'partial success outcome missing');
assert(narrativeRules.includes("critical_failure"), 'critical failure outcome missing');
assert(source.includes("O Narrador não realiza rolagens"), 'Narrator must be blocked from the dice roller');
assert(source.includes("' + 1d12'"), 'Determination d12 expression missing');
assert(source.includes('Math.min(3, paradox - 10)'), 'Paradox 13+ must cap at 3d12');
assert(source.includes('value >= pool.difficulty'), 'Paradox must count every die meeting difficulty');
assert(source.includes('chronus.dice.history.v1'), 'local roll history missing');
assert(source.includes("document.documentElement.dataset.chronusDice = 'v1.3.5-preview'"), 'preview readiness marker missing');

for (const marker of ['Rápido', 'Guiado', 'Paradoxo', 'Repetir', 'Copiar resultado']) {
  assert(source.includes(marker), `roller UI marker missing: ${marker}`);
}

for (const marker of ['chronus-dice-drop', 'prefers-reduced-motion: reduce', '@media (max-width: 620px)', '.dice-result-verdict.is-success', '.dice-result-verdict.is-complication', '.dice-result-verdict.is-failure']) {
  assert(css.includes(marker), `roller CSS contract missing: ${marker}`);
}

const context = { window: { crypto: webcrypto } };
vm.createContext(context);
vm.runInContext(narrativeRules, context);
vm.runInContext(source, context);
const engine = context.window.ChronusDiceRollerV135.engine;

const success = engine.evaluateStandard([3, 6, 8], 6);
assert.strictEqual(success.best, 8);
assert.strictEqual(success.margin, 2);
assert.strictEqual(success.outcome, 'success');
assert.strictEqual(success.narrative.authority, 'player');

const partial = engine.evaluateStandard([2, 4, 6], 6);
assert.strictEqual(partial.best, 6);
assert.strictEqual(partial.margin, 0);
assert.strictEqual(partial.outcome, 'partial_success');
assert.strictEqual(partial.narrative.authority, 'shared');
assert.strictEqual(partial.narrative.narratorAddsPrice, true);

const failure = engine.evaluateStandard([1, 3, 5], 6);
assert.strictEqual(failure.best, 5);
assert.strictEqual(failure.margin, -1);
assert.strictEqual(failure.outcome, 'failure');
assert.strictEqual(failure.narrative.authority, 'narrator');

for (const [paradox, expected] of [
  [1, { count: 1, sides: 8, difficulty: 6 }],
  [5, { count: 5, sides: 8, difficulty: 6 }],
  [6, { count: 1, sides: 10, difficulty: 5 }],
  [10, { count: 5, sides: 10, difficulty: 5 }],
  [11, { count: 1, sides: 12, difficulty: 4 }],
  [12, { count: 2, sides: 12, difficulty: 4 }],
  [13, { count: 3, sides: 12, difficulty: 4 }],
  [21, { count: 3, sides: 12, difficulty: 4 }]
]) {
  const pool = engine.getParadoxPool(paradox);
  assert.strictEqual(pool.count, expected.count, `wrong Paradox pool count for ${paradox}`);
  assert.strictEqual(pool.sides, expected.sides, `wrong Paradox die for ${paradox}`);
  assert.strictEqual(pool.difficulty, expected.difficulty, `wrong Paradox difficulty for ${paradox}`);
}

for (const sides of [4, 6, 8, 10, 12]) {
  for (let index = 0; index < 40; index += 1) {
    const result = engine.secureDie(sides);
    assert(result >= 1 && result <= sides, `d${sides} result out of range`);
  }
}

console.log('v1.3.5 CHRONUS dice roller QA: PASS');
