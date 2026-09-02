const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');

const art = [
  'chronicle-cover.webp', 'sessions-cover.webp', 'npc-known.webp', 'npc-unknown.webp',
  'npc-threat.webp', 'locations-cover.webp', 'documents-cover.webp', 'library-cover.webp'
];

const cssPath = path.join(root, 'css', 'art-pack-v131.css');
const dashboardPath = path.join(root, 'css', 'dashboard.css');
const homePath = path.join(root, 'js', 'modules', 'home.js');

if (!fs.existsSync(cssPath)) throw new Error('missing css/art-pack-v131.css');
const css = fs.readFileSync(cssPath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');

if (!dashboard.trimStart().startsWith("@import url('art-pack-v131.css');")) {
  throw new Error('art-pack-v131.css is not loaded globally before dashboard rules');
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

const homeBuffer = fs.readFileSync(homePath);
// v1.4.2 preserves the approved v1.3 composition while correcting the canon to Berlin 1990.
const expectedHomeSha = 'dd1504e268af47c52aa386b9180b77a8d7ab409b';
if (gitBlobSha(homeBuffer) !== expectedHomeSha) {
  throw new Error('js/modules/home.js differs from the approved v1.4.2 canon version');
}

for (const file of art) {
  const full = path.join(root, 'assets', 'art', file);
  if (!fs.existsSync(full)) throw new Error(`missing art: ${file}`);
  if (fs.statSync(full).size < 3000) throw new Error(`art unexpectedly small: ${file}`);
  if (!css.includes(file)) throw new Error(`art not referenced by art-pack CSS: ${file}`);
}

console.log('v1.3.1 cinematic art pack QA: PASS');
