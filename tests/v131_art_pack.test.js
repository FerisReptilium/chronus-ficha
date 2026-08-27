const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const art = [
  'chronicle-cover.webp', 'sessions-cover.webp', 'npc-known.webp', 'npc-unknown.webp',
  'npc-threat.webp', 'locations-cover.webp', 'documents-cover.webp', 'library-cover.webp'
];
const css = fs.readFileSync(path.join(root, 'css', 'cinematic-v13.css'), 'utf8');
for (const file of art) {
  const full = path.join(root, 'assets', 'art', file);
  if (!fs.existsSync(full)) throw new Error(`missing art: ${file}`);
  if (fs.statSync(full).size < 3000) throw new Error(`art unexpectedly small: ${file}`);
  if (!css.includes(file)) throw new Error(`art not referenced by cinematic CSS: ${file}`);
}
console.log('v1.3.1 cinematic art pack QA: PASS');
