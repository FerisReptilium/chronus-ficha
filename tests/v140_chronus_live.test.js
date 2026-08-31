'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const read = file => fs.readFileSync(file, 'utf8');
const index = read('index.html');
const router = read('js/router.js');
const app = read('js/app.js');
const source = read('js/modules/chronus_live_v140.js');
const css = read('css/chronus-live-v140.css');

assert(index.includes('href="#/live"'), 'CHRONUS LIVE navigation link missing');
assert(index.includes('id="view-live"'), 'CHRONUS LIVE SPA view missing');
assert(index.includes('id="chronus-live-root"'), 'CHRONUS LIVE mount point missing');
assert(index.includes('aria-labelledby="chronus-live-title"'), 'CHRONUS LIVE view needs an accessible title');

assert(router.includes("'#/live': { viewId: 'view-live'"), 'CHRONUS LIVE route missing');
assert(router.includes("'#/live': { viewId: 'view-live', title: 'CHRONUS LIVE · Sala da Crônica', authRequired: true }"), 'CHRONUS LIVE must require authentication');
assert(router.includes("window.location.hostname !== '127.0.0.1'"), 'local preview must be restricted to loopback');
assert(router.includes("window.location.hostname !== 'localhost'"), 'local preview must be restricted to localhost');
assert(router.includes("new URLSearchParams(query).get('preview') === '1'"), 'local preview opt-in missing');
assert(router.includes("window.ChronusLiveV140?.load?.()"), 'router must load CHRONUS LIVE on navigation');
assert(router.includes("document.body.classList.toggle('in-live-mode', cleanHash === '#/live')"), 'live body mode missing');

assert(app.includes("loadScriptOnce('js/modules/chronus_live_v140.js')"), 'CHRONUS LIVE module must load progressively');
assert(source.includes("const PREVIEW_MARKER = 'v1.4.0-prototype'"), 'prototype readiness marker missing');
assert(source.includes("mode: 'prototype'"), 'prototype mode contract missing');
assert(source.includes("data.mediaState") || source.includes('dataset.mediaState'), 'media state marker missing');
assert(source.includes("local.camera = !local.camera"), 'camera/portrait toggle missing');
assert(source.includes("local.microphone = !local.microphone"), 'microphone state toggle missing');
assert(source.includes("state.screenShare = !state.screenShare"), 'screen-share prototype state missing');
assert(source.includes("launcher.click()"), 'existing dice roller integration missing');
assert(source.includes(".from('characters')"), 'existing character data integration missing');
assert(source.includes(".from('portraits')"), 'existing portrait storage integration missing');
assert(source.includes(".download(`${user.id}/portrait`)"), 'current-user portrait path missing');
assert(source.includes('textContent'), 'dynamic participant content must use textContent');
assert(source.includes('aria-live="polite"'), 'live announcements missing');

for (const forbidden of [
  'getUserMedia(',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_SECRET_KEY',
  'service_role',
  'roomAdmin',
  'MediaRecorder('
]) {
  assert(!source.includes(forbidden), `prototype must not contain production media/secret capability: ${forbidden}`);
}

for (const asset of [
  'assets/art/v132-hero-berlin.webp',
  'assets/art/v132-npc-contact.webp',
  'assets/art/npc-known.webp',
  'assets/art/v132-npc-unknown.webp',
  'assets/art/v132-npc-threat.webp',
  'assets/art/v132-documents.webp'
]) {
  assert(source.includes(asset), `prototype asset reference missing: ${asset}`);
  assert(fs.existsSync(asset), `prototype asset does not exist: ${asset}`);
}

assert(css.includes('#view-live'), 'CHRONUS LIVE stylesheet must be scoped');
assert(!css.includes('#view-sheet'), 'CHRONUS LIVE styles must not touch the digital sheet');
assert(css.includes('@media (max-width: 720px)'), 'mobile layout breakpoint missing');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion fallback missing');
assert(css.includes(':focus-visible'), 'keyboard focus treatment missing');
assert(css.includes('.chronus-live-media.is-camera-off'), 'portrait fallback styling missing');
assert(css.includes('.chronus-live-participant.is-speaking'), 'active-speaker styling missing');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
assert.strictEqual(context.window.ChronusLiveV140.mode, 'prototype');
assert.strictEqual(context.window.ChronusLiveV140.marker, 'v1.4.0-prototype');

console.log('v1.4.0 CHRONUS LIVE prototype QA: PASS');
