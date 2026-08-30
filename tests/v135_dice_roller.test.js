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
assert(source.includes("label: 'Sucesso'"), 'positive margin result missing');
assert(source.includes("label: 'Sucesso com Complicação'"), 'zero margin result missing');
assert(source.includes("label: 'Falha ou Complicação'"), 'negative margin result missing');
assert(!/crítico|critico|falha crítica|falha critica/i.test(source), 'manual does not define critical results');
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
vm.runInContext(source, context);
const engine = context.window.ChronusDiceRollerV135.engine;

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(engine.evaluateStandard([3, 6, 8], 6))),
  { best: 8, margin: 2, key: 'success', label: 'Sucesso' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(engine.evaluateStandard([2, 4, 6], 6))),
  { best: 6, margin: 0, key: 'complication', label: 'Sucesso com Complicação' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(engine.evaluateStandard([1, 3, 5], 6))),
  { best: 5, margin: -1, key: 'failure', label: 'Falha ou Complicação' }
);

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
