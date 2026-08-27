const fs = require('fs');
const assert = require('assert');

const chronicle = fs.readFileSync('js/modules/chronicle.js', 'utf8');
const css = fs.readFileSync('css/cinematic-chronicle-page-v13.css', 'utf8');
const content = fs.readFileSync('js/services/content.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(chronicle.includes("const STYLESHEET = 'css/cinematic-chronicle-page-v13.css'"));
assert(chronicle.includes('window.ChronusContent.getChapters()'));
assert(chronicle.includes("window.ChronusAssets?.getSignedUrl?.('campaign-images'"));
assert(chronicle.includes("window.ChronusRouter?.getCurrentRoute?.() === '#/chronicle'"));
assert(chronicle.includes('textContent = chapter.content'));
assert(!chronicle.includes('innerHTML = chapter.content'));
assert(chronicle.includes('chronicle-page-timeline-v13'));
assert(chronicle.includes('chronicle-page-summary-v13'));
assert(chronicle.includes('Ler registro completo'));
assert(chronicle.includes('Nenhum capítulo publicado'));
assert(chronicle.includes('Não foi possível abrir a Crônica'));

assert(content.includes(".from('chronicle_chapters')"));
assert(content.includes('id, chapter_number, title, subtitle, slug, summary, content, cover_image_path, visibility, sort_order, published, published_at'));
assert(index.includes('id="view-chronicle"'));
assert(index.includes('id="chronicle-list-container"'));

assert(css.includes('#view-chronicle.chronicle-internal-v13'));
assert(css.includes('.chronicle-page-entry-v13'));
assert(css.includes('@media (max-width: 600px)'));
assert(css.includes('@media (prefers-reduced-motion: reduce)'));
const effectiveCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert(!effectiveCss.includes('#view-sheet'));

console.log('PASS: CHRONUS v1.3 Chronicle internal cinematic page invariants preserved.');
