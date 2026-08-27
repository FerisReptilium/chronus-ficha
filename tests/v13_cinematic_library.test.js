const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-library-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(home.includes('setupLibraryScene'), 'Library scene initializer is missing');
assert(home.includes('library-scene-v13'), 'Library scene markup is missing');
assert(home.includes('css/cinematic-library-v13.css'), 'Library scene stylesheet is not loaded');
assert(home.includes('href=\"#/library\"'), 'Library scene must preserve #/library route');
assert(home.includes(".editorial-card:nth-child(6)"), 'Library legacy card lookup must target the sixth card');
assert(home.includes("promoteCardToScene(libraryCard, 'library')"), 'legacy Library card must be promoted/hidden');

for (const token of ['Biblioteca', 'Manual do sistema', 'Guia rápido', 'Ambientação', 'Acervo reservado', 'Restrito']) {
  assert(home.includes(token), `Library catalog semantics missing: ${token}`);
}

assert(css.includes('#view-home .library-scene-v13'), 'Library CSS must remain scoped to #view-home');
assert(!css.includes('#view-sheet'), 'Phase 2F must not target the character sheet');
assert(css.includes('library-book-grid'), 'Library book presentation must be styled');
assert(css.includes('library-catalog-panel'), 'Library catalog panel must be styled');
assert(css.includes('@media (max-width: 600px)'), 'Library scene needs mobile treatment');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Library scene must respect reduced motion');

for (const stableControl of ['hero-btn-chronicle', 'hero-btn-universe', 'hero-btn-player-area']) {
  assert(index.includes(`id=\"${stableControl}\"`), `stable hero control missing: ${stableControl}`);
  assert(home.includes(stableControl), `stable hero handler missing: ${stableControl}`);
}

for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `third-party reference leaked into home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `third-party reference leaked into Library CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 restricted occult library scene invariants preserved.');
