const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync('js/rules/narrative_resolution.js', 'utf8'),
  context
);
const resolve = context.window.ChronusNarrativeRules.resolve;

const cases = [
  { dice: [4, 7, 6], difficulty: 4, outcome: 'exceptional_success', authority: 'player', acts: 1, condition: true },
  { dice: [5, 7, 6], difficulty: 6, outcome: 'success', authority: 'player', acts: 0, condition: false },
  { dice: [3, 6, 4], difficulty: 6, outcome: 'partial_success', authority: 'shared', acts: 0, condition: false },
  { dice: [2, 5, 4], difficulty: 6, outcome: 'failure', authority: 'narrator', acts: 0, condition: false },
  { dice: [1, 3, 2], difficulty: 6, outcome: 'critical_failure', authority: 'narrator', acts: 1, condition: false }
];

for (const test of cases) {
  const result = resolve(test.dice, test.difficulty);
  assert.strictEqual(result.outcome, test.outcome);
  assert.strictEqual(result.narrative.authority, test.authority);
  assert.strictEqual(result.consequences.acts, test.acts);
  assert.strictEqual(result.consequences.condition, test.condition);
  assert.strictEqual(result.narratorRollsDice, false);
}

assert.strictEqual(
  resolve([2, 6, 4], 6).narrative.narratorAddsPrice,
  true,
  'partial success must add a price decided by the Narrator'
);
assert.throws(() => resolve([], 6), /ao menos um resultado/);
assert.throws(() => resolve([0, 6], 6), /entre 1 e 12/);
assert.throws(() => resolve([6], 3), /4, 5, 6 ou 7/);
assert.throws(() => resolve([6], 8), /4, 5, 6 ou 7/);
assert.throws(() => resolve([6, 6, 6, 6, 6], 6), /no máximo três dados básicos/);

console.log('CHRONUS narrative authority tests: PASS');
