'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');

assert.equal(html.includes('href="css/sheet.css"'), false, 'The large character-sheet stylesheet must not block the initial portal load.');
assert.ok(router.includes('function ensureSheetStylesheet()'), 'The router must provide an on-demand stylesheet loader.');
assert.ok(router.includes("loadSheetStylesheet('css/sheet.css')"), 'The loader must request the original character-sheet stylesheet.');
assert.ok(router.includes("loadSheetStylesheet('css/sheet-writing-alignment-v15.css')"), 'Writing alignment must remain part of the lazy stylesheet sequence.');
assert.ok(router.includes("loadSheetStylesheet('css/resource-counters.css')"), 'Resource controls must remain part of the lazy stylesheet sequence.');
assert.ok(router.includes('async function handleRouteChange()'), 'Route handling must await the sheet stylesheet before showing the sheet.');

const sheetRoute = router.indexOf("if (cleanHash === '#/sheet') {", router.indexOf('if (routeDef.openAuth)'));
const sheetAwait = router.indexOf('await ensureSheetStylesheet()', sheetRoute);
const navigationGuard = router.indexOf('routeVersion !== navigationVersion', sheetAwait);
const viewActivation = router.indexOf('// Alternar visualizações ativas');

assert.ok(sheetRoute >= 0 && sheetAwait > sheetRoute, 'The stylesheet must load only for the authenticated sheet route.');
assert.ok(navigationGuard > sheetAwait, 'A stale route must be ignored after the asynchronous stylesheet load.');
assert.ok(viewActivation > navigationGuard, 'The stylesheet must load before the sheet view becomes visible.');

console.log('CHRONUS lazy sheet stylesheet: PASS');
