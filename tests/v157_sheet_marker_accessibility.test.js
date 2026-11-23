'use strict';

const assert = require('assert');
const fs = require('fs');
const engine = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');

const binaryStart = engine.indexOf('function binaryMarker');
const binaryEnd = engine.indexOf('function nextWoundState', binaryStart);
assert(binaryStart >= 0 && binaryEnd > binaryStart, 'Binary marker implementation must exist');
const binary = engine.slice(binaryStart, binaryEnd);
assert(binary.includes("b.setAttribute('aria-pressed', String(b.dataset.state === 'filled'))"), 'Binary markers must expose their initial pressed state');
assert(binary.includes("b.setAttribute('aria-pressed', String(n === 'filled'))"), 'Binary markers must update their pressed state after activation');

const woundStart = engine.indexOf('function woundMarker');
const woundEnd = engine.indexOf('function bindInputs', woundStart);
assert(woundStart >= 0 && woundEnd > woundStart, 'Wound marker implementation must exist');
const wound = engine.slice(woundStart, woundEnd);
for (const label of ['vazia', 'corte', 'ferida', 'ferida crítica']) {
  assert(wound.includes(label), `Wound markers must announce state: ${label}`);
}
assert(wound.includes('syncWoundAccessibility()'), 'Wound accessibility state must be synchronized on render and change');
assert(wound.includes("b.setAttribute('aria-pressed', String(b.dataset.state !== 'empty'))"), 'Wound marker must expose whether any wound is present');

console.log('CHRONUS sheet marker accessibility regression: PASS');
