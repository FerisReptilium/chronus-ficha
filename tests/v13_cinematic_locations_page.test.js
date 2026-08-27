const fs = require('fs');

const js = fs.readFileSync('js/modules/locations.js', 'utf8');
const css = fs.readFileSync('css/cinematic-locations-page-v13.css', 'utf8');
const content = fs.readFileSync('js/services/content.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(js.includes("const STYLESHEET = 'css/cinematic-locations-page-v13.css'"), 'Locations page stylesheet must be registered');
assert(js.includes("window.ChronusContent.getLocations()"), 'Locations must use ChronusContent.getLocations()');
assert(js.includes("window.ChronusAssets?.getSignedUrl?.('campaign-images'"), 'Location images must use signed campaign-images URLs');
assert(js.includes("window.ChronusAssets?.getSignedUrl?.('maps'"), 'Location maps must use signed maps URLs');
assert(js.includes("window.ChronusRouter?.getCurrentRoute?.() === '#/maps'"), 'Locations must keep route race guard');
assert(js.includes('textContent = loc.public_description'), 'Public description must use textContent');
assert(js.includes('textContent = loc.narrative_address'), 'Narrative address must use textContent');
assert(js.includes("value.textContent = parent?.name || 'Referência superior não disponível neste acesso'"), 'Hidden parent UUID must not be exposed');
assert(js.includes('candidate.parent_location_id === loc.id'), 'Visible hierarchy must derive child relationships from returned records');
assert(!js.includes('innerHTML = loc.'), 'Supabase location content must not be injected as HTML');
assert(!js.includes('innerHTML = parent'), 'Hierarchy data must not be injected as HTML');
assert(content.includes(".select('id, name, slug, type, district_region, narrative_address, public_description, image_path, map_image_path, parent_location_id, visibility, sort_order, published, published_at')"), 'Content service must expose required location fields');
assert(css.includes('#view-maps.locations-internal-v13'), 'CSS must be scoped to Locations view');
assert(css.includes('.locations-page-atlas-v13'), 'Atlas layout must exist');
assert(css.includes('.locations-page-map-v13'), 'Map presentation must exist');
assert(css.includes('.locations-page-hierarchy-v13'), 'Hierarchy presentation must exist');
assert(css.includes('@media (max-width: 600px)'), 'Mobile treatment must exist');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced motion treatment must exist');
assert(!css.includes('#view-sheet'), 'Locations CSS must not target the sheet view');

console.log('v1.3 Phase 4D Locations internal cinematic page: OK');
