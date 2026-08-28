'use strict';

const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const app = read('js/app.js');
const home = read('js/modules/home_v132.js');
const css = read('css/editorial-v132-rebuild.css');

assert(app.includes("loadScriptOnce('js/modules/home_v132.js')"), 'v1.3.2 Home module must load from app bootstrap');
assert(app.includes("loadScriptOnce('js/modules/home_motion.js')"), 'v1.3.1 motion fallback must remain available');
assert(home.includes("window.ChronusHomeV132"), 'v1.3.2 namespace missing');
assert(home.includes("LEGACY_SCENES"), 'legacy scene replacement contract missing');
assert(home.includes("document.documentElement.dataset.chronusHome = 'v1.3.2-art-preview'"), 'art preview readiness marker missing');

for (const route of ['#/chronicle', '#/system', '#/sessions', '#/npcs', '#/maps', '#/files', '#/library']) {
  assert(home.includes(`href="${route}"`), `editorial route missing: ${route}`);
}

for (const art of [
  'v132-hero-berlin.webp',
  'v132-sessions.webp',
  'v132-documents.webp',
  'v132-atlas.webp',
  'v132-library.webp',
  'v132-npc-contact.webp',
  'v132-npc-unknown.webp',
  'v132-npc-threat.webp'
]) {
  assert(fs.existsSync(`assets/art/${art}`), `v1.3.2 art missing: ${art}`);
  assert(home.includes(art) || css.includes(art), `v1.3.2 art is not wired into the preview: ${art}`);
}

assert(!home.includes('hero-berlin-1992.webp'), 'corrupted hero asset must not be referenced by the rebuild module');
assert(!css.includes('hero-berlin-1992.webp'), 'corrupted hero asset must not be referenced by the rebuild CSS');
assert(css.includes('@media (max-width: 760px)'), 'mobile layout missing');
assert(css.includes('prefers-reduced-motion: reduce'), 'reduced-motion fallback missing');
assert(!css.includes('#view-sheet'), 'v1.3.2 editorial CSS must not style the digital sheet');

console.log('v1.3.2 editorial rebuild static QA: PASS');
