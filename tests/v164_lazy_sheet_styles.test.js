'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');

assert.doesNotMatch(html, /<link\\b[^>]*href=["']css\\/sheet\\.css["']/, 'The large character-sheet stylesheet must not block the initial portal load.');
assert.match(router, /function ensureSheetStylesheet\\(\\)[\\s\\S]*?link\\.rel = 'stylesheet'[\\s\\S]*?link\\.href = 'css\\/sheet\\.css'[\\s\\S]*?document\\.head\\.appendChild\\(link\\)/, 'The router must provide an on-demand stylesheet loader.');
assert.match(router, /async function handleRouteChange\\(\\)/, 'Route handling must await the sheet stylesheet before showing the sheet.');
assert.match(router, /if \\(cleanHash === '#\\/sheet'\\) \\{[\\s\\S]*?await ensureSheetStylesheet\\(\\)[\\s\\S]*?routeVersion !== navigationVersion[\\s\\S]*?latestHash !== cleanHash/, 'The sheet route must await CSS and ignore stale navigation completions.');
assert.ok(router.indexOf('await ensureSheetStylesheet()') < router.indexOf('// Alternar visualizações ativas'), 'The sheet stylesheet must load before the sheet view becomes visible.');

console.log('CHRONUS lazy sheet stylesheet: PASS');
