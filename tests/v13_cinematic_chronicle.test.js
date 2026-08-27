const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-scenes-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(home.includes('setupChronicleScene'), 'Chronicle scene initializer is missing');
assert(home.includes('chronicle-scene-v13'), 'Chronicle scene markup is missing');
assert(home.includes('css/cinematic-scenes-v13.css'), 'Chronicle scene stylesheet is not loaded');
assert(home.includes("href=\"#/chronicle\""), 'Chronicle scene must preserve #/chronicle route');
assert(home.includes('editorial-card'), 'legacy editorial card discovery must remain explicit');
assert(home.includes("chronicleCard.hidden = true"), 'legacy Chronicle card must be hidden after promotion');
assert(home.includes("data.promotedToScene") || home.includes('dataset.promotedToScene'), 'promoted Chronicle card must be marked');

assert(css.includes('#view-home .chronicle-scene-v13'), 'Chronicle CSS must remain scoped to #view-home');
assert(!css.includes('#view-sheet'), 'Phase 2A must not target the character sheet');
assert(css.includes("hero-berlin-1992.webp"), 'Chronicle scene must reuse the homologated local Berlin art');
assert(css.includes('@media (max-width: 600px)'), 'Chronicle scene needs mobile treatment');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Chronicle scene must respect reduced motion');

for (const stableControl of ['hero-btn-chronicle', 'hero-btn-universe', 'hero-btn-player-area']) {
  assert(index.includes(`id=\"${stableControl}\"`), `stable hero control missing: ${stableControl}`);
  assert(home.includes(stableControl), `stable hero handler missing: ${stableControl}`);
}

for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `third-party reference leaked into home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `third-party reference leaked into cinematic scenes CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 Chronicle cinematic scene invariants preserved.');
