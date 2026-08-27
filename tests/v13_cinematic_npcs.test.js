const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-npcs-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(home.includes('setupNpcsScene'), 'NPC scene initializer is missing');
assert(home.includes('npcs-scene-v13'), 'NPC scene markup is missing');
assert(home.includes('css/cinematic-npcs-v13.css'), 'NPC scene stylesheet is not loaded');
assert(home.includes('href=\"#/npcs\"'), 'NPC scene must preserve #/npcs route');
assert(home.includes(".editorial-card:nth-child(3)"), 'NPC legacy card lookup must target the third card');
assert(home.includes("promoteCardToScene(npcsCard, 'npcs')"), 'legacy NPC card must be promoted/hidden');

for (const token of ['Conhecido', 'Não identificado', 'Ameaça', 'Relação com a Crônica', 'Confidencial']) {
  assert(home.includes(token), `NPC dossier semantics missing: ${token}`);
}

assert(css.includes('#view-home .npcs-scene-v13'), 'NPC CSS must remain scoped to #view-home');
assert(!css.includes('#view-sheet'), 'Phase 2C must not target the character sheet');
assert(css.includes('npc-dossier-card'), 'NPC dossier cards must be styled');
assert(css.includes('npc-threat-high'), 'threat classification styling is missing');
assert(css.includes('@media (max-width: 600px)'), 'NPC scene needs mobile treatment');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'NPC scene must respect reduced motion');

for (const stableControl of ['hero-btn-chronicle', 'hero-btn-universe', 'hero-btn-player-area']) {
  assert(index.includes(`id=\"${stableControl}\"`), `stable hero control missing: ${stableControl}`);
  assert(home.includes(stableControl), `stable hero handler missing: ${stableControl}`);
}

for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `third-party reference leaked into home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `third-party reference leaked into NPC CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 NPC dossier cinematic scene invariants preserved.');
