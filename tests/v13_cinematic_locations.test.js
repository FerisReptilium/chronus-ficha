const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-locations-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(home.includes('setupLocationsScene'), 'Locations scene initializer is missing');
assert(home.includes('locations-scene-v13'), 'Locations scene markup is missing');
assert(home.includes('css/cinematic-locations-v13.css'), 'Locations stylesheet is not loaded');
assert(home.includes('href=\"#/maps\"'), 'Locations scene must preserve #/maps route');
assert(home.includes(".editorial-card:nth-child(4)"), 'Locations legacy card lookup must target the fourth card');
assert(home.includes("promoteCardToScene(locationsCard, 'locations')"), 'legacy Locations card must be promoted/hidden');

for (const token of ['Atlas oculto de Berlim', 'Alexanderplatz', 'Bunker abandonado', 'Trecho remanescente do Muro', 'Anômalo', 'Não catalogado', 'Risco alto']) {
  assert(home.includes(token), `Locations atlas semantics missing: ${token}`);
}

assert(css.includes('#view-home .locations-scene-v13'), 'Locations CSS must remain scoped to #view-home');
assert(!css.includes('#view-sheet'), 'Phase 2D must not target the character sheet');
assert(css.includes('locations-map-node'), 'atlas map nodes must be styled');
assert(css.includes('locations-atlas-legend'), 'atlas legend must be styled');
assert(css.includes('@media (max-width: 600px)'), 'Locations scene needs mobile treatment');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Locations scene must respect reduced motion');

for (const stableControl of ['hero-btn-chronicle', 'hero-btn-universe', 'hero-btn-player-area']) {
  assert(index.includes(`id=\"${stableControl}\"`), `stable hero control missing: ${stableControl}`);
  assert(home.includes(stableControl), `stable hero handler missing: ${stableControl}`);
}

for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `third-party reference leaked into home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `third-party reference leaked into Locations CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 occult Berlin atlas Phase 2D invariants preserved.');
