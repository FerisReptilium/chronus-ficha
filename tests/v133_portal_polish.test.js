'use strict';

const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const app = read('js/app.js');
const moduleSource = read('js/modules/portal_v133.js');
const css = read('css/portal-v133.css');
const home = read('js/modules/home_v132.js');
const homeCss = read('css/editorial-v132-rebuild.css');
const index = read('index.html');

assert(app.includes("loadScriptOnce('js/modules/portal_v133.js')"), 'v1.3.3 portal module must load from bootstrap');
assert(moduleSource.includes("document.documentElement.dataset.chronusPortal = 'v1.3.3-preview'"), 'v1.3.3 readiness marker missing');

for (const view of ['chronicle','sessions','npcs','maps','files','soundtrack','system','library']) {
  assert(moduleSource.includes(`view-${view}`), `v1.3.3 view configuration missing: ${view}`);
  assert(css.includes(`#view-${view}`), `v1.3.3 hero mapping missing: ${view}`);
}

for (const art of [
  'v132-hero-berlin.webp','v132-sessions.webp','v133-hero-npcs.webp','v132-atlas.webp',
  'v132-documents.webp','v133-hero-soundtrack.webp','v133-hero-system.webp','v132-library.webp'
]) {
  const path = `assets/art/${art}`;
  assert(fs.existsSync(path), `hero art missing: ${art}`);
  assert.strictEqual(fs.readFileSync(path).subarray(0, 4).toString(), 'RIFF', `invalid WebP: ${art}`);
  assert(css.includes(art), `hero art is not wired: ${art}`);
}

assert(index.includes('class="portal-container system-v133-container"'), 'System must use v1.3.3 structure');
assert(index.includes('system-v133-principles'), 'System editorial principles missing');
assert(!index.includes('style="max-width: 860px;"'), 'legacy System inline layout must be removed');
assert(home.includes('v132-library-volume'), 'Home library volumes must be editorially detailed');
assert(homeCss.includes('.v132-library-volume::before'), 'library cover ornament missing');
assert(css.includes('@media (max-width: 760px)'), 'v1.3.3 mobile layout missing');
assert(css.includes('prefers-reduced-motion: reduce'), 'v1.3.3 reduced-motion fallback missing');
assert(!css.includes('#view-sheet'), 'v1.3.3 portal CSS must not style the digital sheet');
assert(!css.includes('hero-berlin-1992.webp'), 'corrupted hero asset must not be used by v1.3.3');

console.log('v1.3.3 portal polish static QA: PASS');
