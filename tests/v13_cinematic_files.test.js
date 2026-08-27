const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-files-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(home.includes('setupFilesScene'), 'Files scene initializer is missing');
assert(home.includes('files-scene-v13'), 'Files scene markup is missing');
assert(home.includes('css/cinematic-files-v13.css'), 'Files scene stylesheet is not loaded');
assert(home.includes('href=\"#/files\"'), 'Files scene must preserve #/files route');
assert(home.includes(".editorial-card:nth-child(5)"), 'Files legacy card lookup must target the fifth card');
assert(home.includes("promoteCardToScene(filesCard, 'files')"), 'legacy Files card must be promoted/hidden');

for (const token of ['Evidências confiscadas', 'Relatório de Ocorrência', 'Carta não enviada', 'Censurado', 'Recorte de jornal', 'Trechos censurados']) {
  assert(home.includes(token), `Files evidence semantics missing: ${token}`);
}

assert(css.includes('#view-home .files-scene-v13'), 'Files CSS must remain scoped to #view-home');
assert(!css.includes('#view-sheet'), 'Phase 2E must not target the character sheet');
assert(css.includes('files-evidence-photo'), 'evidence photograph styling is missing');
assert(css.includes('files-redaction'), 'redaction styling is missing');
assert(css.includes('files-confiscated-stamp'), 'confiscated stamp styling is missing');
assert(css.includes('@media (max-width: 600px)'), 'Files scene needs mobile treatment');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Files scene must respect reduced motion');

for (const stableControl of ['hero-btn-chronicle', 'hero-btn-universe', 'hero-btn-player-area']) {
  assert(index.includes(`id=\"${stableControl}\"`), `stable hero control missing: ${stableControl}`);
  assert(home.includes(stableControl), `stable hero handler missing: ${stableControl}`);
}

for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `third-party reference leaked into home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `third-party reference leaked into Files CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 confiscated evidence cinematic scene invariants preserved.');
