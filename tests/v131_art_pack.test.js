const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const art = [
  'chronicle-cover.webp', 'sessions-cover.webp', 'npc-known.webp', 'npc-unknown.webp',
  'npc-threat.webp', 'locations-cover.webp', 'documents-cover.webp', 'library-cover.webp'
];
const cssPath = path.join(root, 'css', 'art-pack-v131.css');
if (!fs.existsSync(cssPath)) throw new Error('missing css/art-pack-v131.css');
const css = fs.readFileSync(cssPath, 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
if (!home.includes("const V131_ART_PACK_STYLESHEET = 'css/art-pack-v131.css';")) throw new Error('art pack stylesheet constant missing from home.js');
if (!home.includes("appendStylesheetOnce(V131_ART_PACK_STYLESHEET, 'chronus-v131-layer', 'art-pack');")) throw new Error('art pack stylesheet is not loaded by home.js');
for (const file of art) {
  const full = path.join(root, 'assets', 'art', file);
  if (!fs.existsSync(full)) throw new Error(`missing art: ${file}`);
  if (fs.statSync(full).size < 3000) throw new Error(`art unexpectedly small: ${file}`);
  if (!css.includes(file)) throw new Error(`art not referenced by art-pack CSS: ${file}`);
}
console.log('v1.3.1 cinematic art pack QA: PASS');
