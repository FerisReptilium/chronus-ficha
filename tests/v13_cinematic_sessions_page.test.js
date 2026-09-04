const fs = require('fs');
const assert = require('assert');

const sessions = fs.readFileSync('js/modules/sessions.js', 'utf8');
const css = fs.readFileSync('css/cinematic-sessions-page-v13.css', 'utf8');
const content = fs.readFileSync('js/services/content.js', 'utf8');

assert(sessions.includes("const STYLESHEET = 'css/cinematic-sessions-page-v13.css'"), 'Sessions page stylesheet must be isolated');
assert(sessions.includes("window.ChronusContent.getSessions()"), 'Sessions page must use the existing read-only content service');
assert(content.includes("from('campaign_sessions')"), 'Content service must keep campaign_sessions as source');
for (const field of ['events_log', 'clues_uncovered', 'current_objective']) {
  assert(content.includes(`'${field}'`), `Session field must remain part of the read model: ${field}`);
}
assert(sessions.includes("window.ChronusAssets?.getSignedUrl?.('campaign-images'"), 'Private covers must use signed URLs');
assert(sessions.includes("window.ChronusRouter?.getCurrentRoute?.() === '#/sessions'"), 'Race guard must validate the active Sessions route');
assert(sessions.includes('content.textContent = text'), 'Events/clues must be rendered as textContent');
assert(!sessions.includes('content.innerHTML = text'), 'Supabase text must never be injected as HTML');
assert(sessions.includes('sessionSummary.textContent = session.summary'), 'Real session summaries must use textContent');
assert(sessions.includes('gameDate.textContent = `Na narrativa · ${session.in_game_date}`'), 'In-game date must come from the real record');
assert(sessions.includes("buildRecordDetails('Eventos registrados', session.events_log"), 'Events log must be exposed safely');
assert(sessions.includes("buildRecordDetails('Pistas descobertas', session.clues_uncovered"), 'Clues must be exposed safely');
assert(sessions.includes('renderLoading(container)'), 'Loading state must remain explicit');
assert(sessions.includes('renderEmpty(container)'), 'Empty state must remain explicit');
assert(sessions.includes('renderError(container)'), 'Error state must remain explicit');
assert(css.includes('#view-sessions.sessions-internal-v13'), 'CSS must be scoped to view-sessions');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Sessions page must respect reduced motion');
assert(!css.includes('#view-sheet'), 'Sessions page must not target the character sheet');

console.log('PASS: CHRONUS v1.3 Sessions internal cinematic page invariants preserved.');
