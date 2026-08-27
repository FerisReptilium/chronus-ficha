'use strict';

const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('js/modules/library.js', 'utf8');
const css = fs.readFileSync('css/cinematic-library-page-v13.css', 'utf8');

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const effectiveCss = stripComments(css);

// Source + route + cinematic initializer.
assert(js.includes("window.ChronusContent.getLibraryItems()"), 'Library must consume ChronusContent.getLibraryItems()');
assert(js.includes("=== '#/library'"), 'Library route guard must remain #/library');
assert(js.includes("css/cinematic-library-page-v13.css"), 'Library page stylesheet must be loaded');
assert(js.includes("library-internal-v13"), 'Library internal cinematic class must be applied');
assert(js.includes("library-page-context-v13"), 'Library page context must be mounted');

// Real Supabase fields requested by Phase 4F.
['title','category','version','description','cover_path','file_path','file_size_bytes','page_count','visibility','published'].forEach(field => {
  assert(js.includes(field), `Expected real library field: ${field}`);
});

// Canonical schema categories, not invented legacy categories.
['system_book','pocket_manual','quick_guide','character_sheet','supplement','extra'].forEach(category => {
  assert(js.includes(`'${category}'`), `Missing canonical library category: ${category}`);
});

// Security contracts.
assert(js.includes("getSignedUrl?.('library', item.cover_path, { expiresIn: 3600 })"), 'Cover must use 1h signed URL');
assert(js.includes("getSignedUrl?.('library', item.file_path, { expiresIn: 300 })"), 'File must use 5min signed URL');
assert(js.includes("openBtn.addEventListener('click', async () =>"), 'File signing must be click-triggered');
assert(js.includes('textContent = item.description'), 'Supabase description must use textContent');
assert(!js.includes('innerHTML = item.'), 'Supabase fields must never be injected as innerHTML');
assert(js.includes('isRequestCurrent(requestId)'), 'Race guard must remain active');

// Size/page rendering + summary.
assert(js.includes('formatFileSize'), 'File size formatter must exist');
assert(js.includes('page_count'), 'Page count must be rendered');
assert(js.includes('library-page-summary-v13'), 'Authorized-data summary must exist');
assert(js.includes('library-page-facts-v13'), 'Book facts block must exist');
assert(js.includes('library-page-open-button-v13'), 'Open-file action must exist');

// Scope + responsive/accessibility.
assert(effectiveCss.includes('#view-library'), 'CSS must be scoped to #view-library');
assert(!effectiveCss.includes('#view-sheet'), 'Library cinematic CSS must not style the sheet');
assert(css.includes('@media (max-width:600px)'), 'Mobile treatment is required');
assert(css.includes('@media (prefers-reduced-motion:reduce)'), 'Reduced motion fallback is required');
assert(js.includes("aria-live', 'polite'"), 'File action feedback must be announced accessibly');

// No borrowed World of Darkness/Paradox branding.
assert(!/paradox|world of darkness|vampire: the masquerade/i.test(js + css), 'No third-party branding should appear');

console.log('v1.3 Phase 4F Library internal cinematic page: PASS');
