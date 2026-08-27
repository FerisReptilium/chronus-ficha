const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('js/modules/home.js', 'utf8');
const css = fs.readFileSync('css/cinematic-sessions-v13.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(home.includes('setupSessionsScene'), 'Sessions scene initializer missing');
assert(home.includes('css/cinematic-sessions-v13.css'), 'Sessions stylesheet not loaded');
assert(home.includes('sessions-scene-v13'), 'Sessions scene markup missing');
assert(home.includes('sessions-timeline'), 'Sessions chronology missing');
assert(home.includes('sessions-photo-stack'), 'Sessions evidence-photo treatment missing');
assert(home.includes('sessions-notes'), 'Sessions investigation notes missing');
assert(home.includes('data-caption'), 'Sessions photo captions missing');
assert(home.includes('href="#/sessions"'), 'Sessions route changed or missing');
assert(home.includes("nth-child(2)"), 'Second editorial card must be promoted to Sessions scene');
assert(home.includes("promoteCardToScene(sessionsCard, 'sessions')"), 'Sessions legacy card must be hidden after promotion');

assert(css.includes('#view-home .sessions-scene-v13'), 'Sessions CSS must be scoped to Home');
assert(!css.includes('#view-sheet'), 'Sessions cinematic styles must not target the sheet');
assert(css.includes('@media (max-width: 600px)'), 'Sessions mobile treatment is mandatory');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Sessions reduced-motion treatment is mandatory');
assert(css.includes("url('../assets/art/hero-berlin-1992.webp')"), 'Sessions must reuse the approved local art until a dedicated asset exists');

assert(index.includes('Diário de Sessões'), 'Original Sessions editorial card must remain in source as progressive fallback');

for (const forbidden of ['paradoxinteractive.com', 'worldofdarkness.com', 'World of Darkness', 'Vampire: The Masquerade']) {
  assert(!home.includes(forbidden), `forbidden third-party reference in home.js: ${forbidden}`);
  assert(!css.includes(forbidden), `forbidden third-party reference in Sessions CSS: ${forbidden}`);
}

console.log('PASS: CHRONUS v1.3 Sessions cinematic scene Phase 2B invariants preserved.');
