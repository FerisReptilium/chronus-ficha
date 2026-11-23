'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');
const css = fs.readFileSync('css/route-announcement-v15.css', 'utf8');

assert(html.includes('id="route-announcer" class="chronus-visually-hidden" role="status" aria-live="polite" aria-atomic="true"'), 'The portal must expose a polite, atomic live region for route changes');
assert(html.includes('css/route-announcement-v15.css'), 'The visually-hidden live region stylesheet must be loaded');
assert(router.includes('let hasRenderedInitialRoute = false;'), 'The router must track whether the initial route has rendered');
assert(router.includes('const routeChanged = hasRenderedInitialRoute && currentRoute !== cleanHash;'), 'Only subsequent route changes may be announced');
assert(router.includes("document.getElementById('route-announcer')"), 'The router must update the route announcement region');
assert(router.includes("announcer.textContent = routeDef.title || 'Página atualizada';"), 'The announced text must use the active route title');
assert(css.includes('.chronus-visually-hidden') && css.includes('clip-path: inset(50%)'), 'The announcement region must be visually hidden without display:none');

console.log('CHRONUS SPA route announcement accessibility regression: PASS');
