'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/narrator-panel-polish-v16.css'), 'utf8');
const narrator = fs.readFileSync(path.join(root, 'js/modules/narrator_panel.js'), 'utf8');
const live = fs.readFileSync(path.join(root, 'js/services/narrative_live.js'), 'utf8');

assert.match(html, /css\/narrator-panel-polish-v16\.css/, 'Narrator presentation layer must be loaded');
for (const selector of [
  '.narrator-narrative-guide',
  '.narrator-live-rolls',
  '.narrator-roll-feed-heading',
  '.narrator-roll-feed-list',
  '.narrator-roll-feed-empty',
  '.narrator-roll-event',
  '.narrator-players-grid',
  '.narrator-player-card'
]) {
  assert.ok(css.includes(selector), `Missing dedicated presentation rule: ${selector}`);
}
assert.match(css, /color:\s*#(?:e8dcc8|f8df93|c8bba7)/i, 'Readable light foreground colors must be explicit');
assert.match(css, /@media\s*\(max-width:\s*768px\)/, 'Narrator panel must have a mobile layout');
assert.match(narrator, /narrator-narrative-guide/);
assert.match(narrator, /narrator-live-rolls/);
assert.match(live, /narrator-roll-feed-empty/);
assert.match(live, /narrator-roll-event/);

console.log('PASS v1.6.0 narrator panel contrast, semantic sections, feed and responsive layout');
