const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('js/modules/documents.js', 'utf8');
const css = fs.readFileSync('css/cinematic-files-page-v13.css', 'utf8');

assert(js.includes("const STYLESHEET = 'css/cinematic-files-page-v13.css'"));
assert(js.includes("window.ChronusContent.getDocuments()"));
assert(js.includes("window.ChronusContent.getSessions()"));
assert(js.includes("window.ChronusAssets?.getSignedUrl?.('documents', doc.image_path, { expiresIn: 3600 })"));
assert(js.includes("window.ChronusAssets?.getSignedUrl?.('documents', doc.file_path, { expiresIn: 300 })"));
assert(js.includes("window.ChronusRouter?.getCurrentRoute?.() === '#/files'"));
assert(js.includes("text.textContent = doc.transcription"));
assert(js.includes("value.textContent = 'Sessão de descoberta não disponível neste acesso'"));
assert(js.includes("file_path nunca é assinado na renderização inicial nem exposto no DOM/HTML"));
assert(!js.includes('innerHTML = doc.transcription'));
assert(!js.includes('dataset.filePath'));
assert(!js.includes('href = doc.file_path'));

const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert(cssNoComments.includes('#view-files'));
assert(!cssNoComments.includes('#view-sheet'));
assert(css.includes('@media(max-width:600px)'));
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
assert(css.includes('.files-page-transcription-v13'));
assert(css.includes('.files-page-session-v13'));

console.log('v1.3 Files internal cinematic page Phase 4E: OK');
