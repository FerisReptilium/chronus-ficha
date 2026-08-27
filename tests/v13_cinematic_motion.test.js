const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('js/app.js', 'utf8');
const motion = fs.readFileSync('js/modules/home_motion.js', 'utf8');
const css = fs.readFileSync('css/cinematic-motion-v13.css', 'utf8');
const audit = fs.readFileSync('docs/v13-home-visual-audit.md', 'utf8');
const motionWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

assert(app.includes("loadScriptOnce('js/modules/home_motion.js')"), 'Phase 3 motion layer must be loaded after Home init');
assert(app.includes('mantendo Home estática'), 'motion failure must degrade gracefully');

for (const selector of [
  '.chronicle-scene-v13',
  '.sessions-scene-v13',
  '.npcs-scene-v13',
  '.locations-scene-v13',
  '.files-scene-v13',
  '.library-scene-v13'
]) {
  assert(motion.includes(selector), `motion setup missing scene: ${selector}`);
}

assert(motion.includes('IntersectionObserver'), 'scroll reveal must use IntersectionObserver');
assert(motion.includes('requestAnimationFrame'), 'parallax must be frame-throttled');
assert(motion.includes("{ passive: true }"), 'scroll/resize listeners must be passive');
assert(motion.includes('prefers-reduced-motion: reduce'), 'JS must respect reduced motion');
assert(motion.includes('is-v13-scenes-complete'), 'legacy editorial fallback gate is missing');
assert(motion.includes('every(Boolean)'), 'legacy section may hide only after all scenes exist');

assert(css.includes('#view-home.is-v13-scenes-complete > .editorial-section'), 'legacy editorial section must hide only after complete scene mount');
assert(css.includes('#view-home.is-v13-motion-enabled .v13-motion-scene'), 'motion CSS must be opt-in');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'motion CSS must expose reduced-motion fallback');
assert(css.includes('@media (hover: hover) and (pointer: fine)'), 'hover movement must be pointer-capability gated');
assert(css.includes('focus-visible'), 'editorial CTAs need visible keyboard focus');
assert(!motionWithoutComments.includes('#view-sheet'), 'Phase 3 must not target the character sheet');

// Audit decision: repeated hero art should remain absent from sessions/NPC/location overrides.
assert(!/sessions-scene-archive[\s\S]{0,700}hero-berlin-1992/.test(motionWithoutComments), 'Sessions audit override should not reuse hero art');
assert(!/npc-dossier-portrait[\s\S]{0,700}hero-berlin-1992/.test(motionWithoutComments), 'NPC audit override should not reuse hero art');
assert(!/locations-atlas-map[\s\S]{0,900}hero-berlin-1992/.test(motionWithoutComments), 'Locations audit override should not reuse hero art');

for (const heading of ['Ritmo vertical excessivo', 'Repetição do mesmo asset de Berlim', 'Mobile', 'Movimento deve ser progressivo']) {
  assert(audit.includes(heading), `visual audit missing finding: ${heading}`);
}

console.log('PASS: CHRONUS v1.3 Home visual audit and progressive motion invariants preserved.');
