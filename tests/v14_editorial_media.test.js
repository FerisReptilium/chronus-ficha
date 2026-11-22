'use strict';
const fs = require('fs');
const assert = require('assert');

const index = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/editorial-media-v14.css', 'utf8');
const npcs = fs.readFileSync('js/modules/npcs.js', 'utf8');

assert(index.includes('css/editorial-media-v14.css'), 'Editorial media refinement stylesheet must load globally');
assert(css.includes('object-fit:contain'), 'Editorial assets must preserve full image proportions');
assert(css.includes('filter:none'), 'Editorial assets must not be artificially darkened or blurred');
assert(css.includes('max-height:min(68vh,620px)'), 'Published asset frames must have a bounded display height');
assert(css.includes('.asset-slot-card .asset-slot-thumb'), 'Narrator asset manager must provide a useful preview frame');
assert(css.includes('#view-npcs .npcs-page-grid-v13'), 'NPC dossier cards must use the larger editorial layout');
assert(css.includes('#view-files .files-page-preview-v13 img'), 'Document previews must preserve source framing');
assert(css.includes('#view-maps .locations-page-map-v13 img'), 'Maps must preserve full cartographic framing');
assert(css.includes('@media(max-width:760px)'), 'Media layout must adapt to mobile');
assert(npcs.includes('npcs-page-disclosure-v14'), 'NPC dossier details must be expandable');
assert(npcs.includes('Ler dossiê completo'), 'NPC disclosure must have an accessible label');
assert(npcs.includes('textContent = npc.public_description'), 'NPC editorial text must remain text-only');
assert(!npcs.includes('innerHTML = npc.'), 'Untrusted editorial content must never be assigned as HTML');

console.log('CHRONUS editorial media v1.4 QA: PASS');
