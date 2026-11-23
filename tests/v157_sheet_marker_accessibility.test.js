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
const listStart = engine.indexOf('function renderList');
const listEnd = engine.indexOf('function renderParadox', listStart);
assert(listStart >= 0 && listEnd > listStart, 'Rendered list marker implementation must exist');
const list = engine.slice(listStart, listEnd);
assert(list.includes("m.setAttribute('aria-pressed', String(m.dataset.state === 'filled'))"), 'List markers must synchronize ARIA after loading persisted list state');

console.log('CHRONUS sheet marker accessibility regression: PASS');
