const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

// Existing routes and controls must remain stable.
for (const id of ['hero-btn-chronicle', 'hero-btn-universe', 'hero-btn-player-area']) {
  assert(index.includes(`id="${id}"`), `missing existing hero control ${id}`);
  assert(home.includes(id), `home module no longer handles ${id}`);
}

assert(home.includes("#/chronicle"), 'chronicle route must remain unchanged');
assert(home.includes("#/system"), 'system route must remain unchanged');
assert(home.includes("#/narrator"), 'narrator route must remain unchanged');
assert(home.includes("#/player"), 'player route must remain unchanged');
assert(home.includes('showAuthModal'), 'anonymous player CTA must still open auth');

// v1.3 visual layer must be incremental and isolated to the Home portal view.
assert(home.includes('css/cinematic-v13.css'), 'v1.3 stylesheet must be loaded by Home');
assert(css.includes('#view-home .hero-cinematic'), 'hero CSS must stay scoped to #view-home');
assert(!css.includes('#view-sheet'), 'cinematic layer must not target the sheet');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion support is mandatory');
assert(css.includes('@media (max-width: 600px)'), 'mobile-specific hero treatment is mandatory');
assert(css.includes('--chronus-hero-art'), 'hero must expose optional art slot');
assert(home.includes('image.onerror'), 'missing-art fallback must be explicit');
assert(home.includes('is-v13-ready'), 'hero readiness state must be explicit');

// No third-party reference brand/assets may be embedded by the implementation.
for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `forbidden third-party reference in home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `forbidden third-party reference in CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 cinematic hero Phase 1 invariants preserved.');
