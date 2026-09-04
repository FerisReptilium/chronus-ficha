'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const read = p => fs.readFileSync(p, 'utf8');
const index = read('index.html');
const router = read('js/router.js');
const auth = read('js/services/auth.js');
const assets = read('js/services/assets.js');
const content = read('js/services/content.js');

const routes = [
  ['#/home', 'view-home'],
  ['#/player', 'view-player'],
  ['#/narrator', 'view-narrator'],
  ['#/live', 'view-live'],
  ['#/sheet', 'view-sheet'],
  ['#/chronicle', 'view-chronicle'],
  ['#/sessions', 'view-sessions'],
  ['#/npcs', 'view-npcs'],
  ['#/maps', 'view-maps'],
  ['#/files', 'view-files'],
  ['#/soundtrack', 'view-soundtrack'],
  ['#/system', 'view-system'],
  ['#/library', 'view-library']
];

// Route/view integrity.
for (const [route, viewId] of routes) {
  assert(router.includes(`'${route}'`), `Missing router route ${route}`);
  assert(index.includes(`id="${viewId}"`), `Missing SPA view ${viewId}`);
}
assert(router.includes("authRequired: true"), 'Player route must remain authenticated');
assert(router.includes("narratorOnly: true"), 'Narrator route must remain narrator-only');
assert(router.includes("profile?.role !== 'narrator'"), 'Narrator role gate must remain active');

// Authentication lifecycle contracts.
assert(auth.includes('signInWithPassword'), 'Password login contract missing');
assert(auth.includes('resetPasswordForEmail'), 'Password recovery contract missing');
assert(auth.includes('updateUser({ password: newPassword })'), 'Password update contract missing');
assert(auth.includes('pushStateToCloud'), 'Dirty sheet must attempt cloud sync before logout');
assert(auth.includes('logout foi CANCELADO'), 'Failed sync must block logout');
assert(auth.includes("client.auth.signOut()"), 'Supabase sign-out contract missing');

// Content reads must leave publication/visibility authority to RLS.
for (const method of ['getChapters','getSessions','getNpcs','getLocations','getDocuments','getSoundtrack','getLibraryItems']) {
  assert(content.includes(`function ${method}`), `Missing content method ${method}`);
}
assert(!/\.eq\(\s*['\"](?:published|visibility|active)['\"]/.test(content), 'Frontend must not replace RLS with publication/visibility filters');

// Signed asset service: strict allowlist + traversal rejection + auth epoch cache isolation.
for (const bucket of ['campaign-images','maps','documents','library']) {
  assert(assets.includes(`'${bucket}'`), `Allowed bucket missing: ${bucket}`);
}
assert(assets.includes("segment === '..' || segment === '.'"), 'Asset path traversal defense missing');
assert(assets.includes('authEpoch++'), 'Asset cache must invalidate on auth changes');
assert(assets.includes('requestAuthEpoch !== authEpoch'), 'In-flight signed URLs must be discarded after auth changes');

// Fase 4 modules: RLS-sourced content, safe text rendering, route race guards.
const modules = {
  chronicle: ['js/modules/chronicle.js', '#/chronicle', 'getChapters'],
  sessions: ['js/modules/sessions.js', '#/sessions', 'getSessions'],
  npcs: ['js/modules/npcs.js', '#/npcs', 'getNpcs'],
  locations: ['js/modules/locations.js', '#/maps', 'getLocations'],
  files: ['js/modules/documents.js', '#/files', 'getDocuments'],
  library: ['js/modules/library.js', '#/library', 'getLibraryItems']
};

for (const [name, [file, route, getter]] of Object.entries(modules)) {
  const js = read(file);
  assert(js.includes(`ChronusContent.${getter}`), `${name}: canonical content getter missing`);
  assert(js.includes(`=== '${route}'`), `${name}: route race guard missing`);
  assert(js.includes('textContent'), `${name}: safe text rendering contract missing`);
  assert(!/innerHTML\s*=\s*(?:item|doc|loc|npc|session|chapter)\./.test(js), `${name}: record data must not enter innerHTML`);
}

// File/library binary paths are signed only on user action, with short TTL.
const docs = read('js/modules/documents.js');
const library = read('js/modules/library.js');
assert(docs.includes("getSignedUrl?.('documents', doc.file_path, { expiresIn: 300 })"), 'Document file TTL must be 5 minutes');
assert(docs.includes("openBtn.addEventListener('click', async () =>"), 'Document file signing must be click-triggered');
assert(library.includes("getSignedUrl?.('library', item.file_path, { expiresIn: 300 })"), 'Library file TTL must be 5 minutes');
assert(library.includes("openBtn.addEventListener('click', async () =>"), 'Library file signing must be click-triggered');

// Cinematic CSS must remain isolated from the digital sheet and include mobile/reduced-motion treatment.
const cinematicCssFiles = fs.readdirSync('css').filter(name => name.startsWith('cinematic-') && name.endsWith('.css'));
assert(cinematicCssFiles.length >= 13, 'Expected complete v1.3 cinematic stylesheet set');
let totalCinematicCssBytes = 0;
for (const file of cinematicCssFiles) {
  const fullPath = path.join('css', file);
  const css = read(fullPath);
  const effective = css.replace(/\/\*[\s\S]*?\*\//g, '');
  totalCinematicCssBytes += fs.statSync(fullPath).size;
  assert(!effective.includes('#view-sheet'), `${file}: cinematic CSS must not style #view-sheet`);
  assert(/@media\s*\([^)]*max-width/i.test(css), `${file}: mobile breakpoint missing`);
}
for (const file of cinematicCssFiles.filter(name => /page-v13|motion-v13|cinematic-v13/.test(name))) {
  assert(/prefers-reduced-motion/i.test(read(path.join('css', file))), `${file}: reduced-motion fallback missing`);
}
assert(totalCinematicCssBytes < 190 * 1024, `Cinematic CSS source budget exceeded: ${totalCinematicCssBytes} bytes`);

// Hero art budget.
const heroStat = fs.statSync('assets/art/hero-berlin-1992.webp');
assert(heroStat.size < 100 * 1024, `Hero art exceeds 100 KB budget: ${heroStat.size} bytes`);

// Digital sheet release invariant: the engine includes the approved v1.4.4 roller bridge,
// while the high-fidelity stylesheet remains byte-for-byte stable from v1.2.
function gitBlobSha(filePath) {
  const buf = fs.readFileSync(filePath);
  const header = Buffer.from(`blob ${buf.length}\0`);
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}
assert.strictEqual(gitBlobSha('js/modules/sheet_engine.js'), '084c2b9f1879a3a5d24093fd4fcea825ce0d67ec', 'sheet_engine.js changed from approved v1.4.4 integration baseline');
assert.strictEqual(gitBlobSha('css/sheet.css'), 'b6b299f2fd1dfd26e8f27d1632a855374d4cd43a', 'sheet.css changed from stable v1.2 baseline');
assert(/<section id="view-sheet" class="portal-view">/.test(index), 'Digital sheet must remain outside portal-shell');

// Basic accessibility/document semantics.
assert(index.includes('<html lang="pt-BR">'), 'Document language must remain pt-BR');
assert(index.includes('name="viewport"'), 'Responsive viewport meta missing');
assert(index.includes('aria-label="Navegação Principal"'), 'Desktop navigation label missing');
assert(index.includes('aria-live="polite"'), 'Live status region missing');
assert(index.includes('aria-label="Abrir Menu"'), 'Mobile menu toggle accessible name missing');

console.log(`v1.3 release static QA: PASS (${routes.length} routes, ${cinematicCssFiles.length} cinematic styles, ${heroStat.size}B hero)`);
