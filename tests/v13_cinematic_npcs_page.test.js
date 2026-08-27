const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('js/modules/npcs.js', 'utf8');
const css = fs.readFileSync('css/cinematic-npcs-page-v13.css', 'utf8');
const content = fs.readFileSync('js/services/content.js', 'utf8');

assert(js.includes("const STYLESHEET = 'css/cinematic-npcs-page-v13.css'"), 'NPC page stylesheet must be registered');
assert(js.includes("window.ChronusContent.getNpcs()"), 'NPC page must consume ChronusContent.getNpcs()');
assert(js.includes("window.ChronusAssets?.getSignedUrl?.('campaign-images'"), 'NPC portraits must use signed URLs');
assert(js.includes("window.ChronusRouter?.getCurrentRoute?.() === '#/npcs'"), 'NPC page must retain active-route race guard');
assert(js.includes('textContent = npc.public_description'), 'Public NPC description must use textContent');
assert(js.includes('document.createTextNode(valueText)'), 'Known personality/relationship text must remain text nodes');
assert(!js.includes('innerHTML = npc.'), 'Supabase NPC content must never be assigned to innerHTML');
assert(js.includes('npc.role_occupation'), 'Role/occupation must be rendered');
assert(js.includes('npc.faction'), 'Faction must be rendered');
assert(js.includes('npc.known_personality'), 'Known personality must be rendered');
assert(js.includes('npc.relationship_to_group'), 'Relationship to group must be rendered');
assert(js.includes('npc.apparent_age'), 'Apparent age must be rendered');
assert(js.includes('npc.visibility'), 'Visibility metadata must come from returned record');
assert(js.includes('npc.published'), 'Publication state must come from returned record');

assert(content.includes(".from('npcs')"), 'Content service must query npcs table');
assert(content.includes('role_occupation, faction, apparent_age, public_description, known_personality, status, relationship_to_group'), 'Content service must select approved NPC fields');

assert(css.includes('#view-npcs.npcs-internal-v13'), 'NPC cinematic styles must be scoped to #view-npcs');
assert(css.includes('.npcs-page-grid-v13'), 'NPC page must define dossier grid');
assert(css.includes('.npcs-page-portrait-v13'), 'NPC page must define portrait treatment');
assert(css.includes('.npcs-page-summary-v13'), 'NPC page must define summary metrics');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'NPC page must honor reduced motion');
assert(!css.includes('#view-sheet'), 'NPC page stylesheet must not target the sheet view');

console.log('v1.3 NPC internal cinematic page checks passed');
