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
const editorialCss = read('css/editorial-v132-rebuild.css');
const preview = read('tests/visual/v140_live_preview.js');

assert(index.includes('href="#/live"'), 'CHRONUS LIVE navigation link missing');
assert(index.includes('<li><a href="#/live" class="nav-link">Ao Vivo</a></li>'), 'desktop CHRONUS LIVE link must not be marked collapsible');
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
assert(source.includes("mode: 'presence-enabled'"), 'authenticated presence mode contract missing');
assert(source.includes("data.mediaState") || source.includes('dataset.mediaState'), 'media state marker missing');
assert(source.includes('microphone.disabled = true') && source.includes('camera.disabled = true') && source.includes('share.disabled = true'), 'unimplemented media controls must remain disabled');
assert(source.includes("channel('chronus-live:main-table', { config: { private: true, presence: { key } } })"), 'private room presence subscription missing');
assert(source.includes("channel.on('presence', { event: 'sync' }, applyPresenceState)"), 'presence sync handler missing');
assert(source.includes("channel.on('presence', { event: 'join' }, applyPresenceState)"), 'presence join handler missing');
assert(source.includes("channel.on('presence', { event: 'leave' }, applyPresenceState)"), 'presence leave handler missing');
assert(source.includes('await channel.track({ user_id: user.id, display_name: currentIdentity.displayName, character_name: character })'), 'authenticated participant tracking missing');
assert(source.includes('presenceChannel.presenceState?.()'), 'participant list must use actual Realtime presence');
assert(source.includes('isLocalPreview() ? DEFAULT_PARTICIPANTS.map'), 'fake participants must be restricted to local preview');
assert(source.includes("launcher.click()"), 'existing dice roller integration missing');
assert(source.includes(".from('characters')"), 'existing character data integration missing');
assert(source.includes(".from('portraits')"), 'existing portrait storage integration missing');
assert(source.includes(".download(`${user.id}/portrait`)"), 'current-user portrait path missing');
assert(source.includes("state: participant.camera ? 'camera' : (hasSource ? 'portrait' : 'empty')"), 'missing portraits must render an explicit empty state');
assert(source.includes("local.portrait = null"), 'portrait hydration must clear stale or demonstration portraits');
assert(source.includes("local.cameraArt = null"), 'camera simulation must not retain stale or demonstration art');
assert(source.includes('portraitHydrationId'), 'portrait hydration must reject stale async responses');
assert(source.includes('personagem ainda não possui foto cadastrada na ficha'), 'missing portrait must be explained without claiming a live camera');
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

for (const forbiddenParticipantArt of [
  'assets/art/v132-hero-berlin.webp',
  'assets/art/v132-npc-contact.webp',
  'assets/art/npc-known.webp',
  'assets/art/v132-npc-unknown.webp',
  'assets/art/v132-npc-threat.webp'
]) {
  assert(!source.includes(forbiddenParticipantArt), `LIVE must not use demonstration participant art: ${forbiddenParticipantArt}`);
}



assert(css.includes('#view-live'), 'CHRONUS LIVE stylesheet must be scoped');
assert(!css.includes('#view-sheet'), 'CHRONUS LIVE styles must not touch the digital sheet');
assert(css.includes('@media (max-width: 720px)'), 'mobile layout breakpoint missing');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion fallback missing');
assert(css.includes(':focus-visible'), 'keyboard focus treatment missing');
assert(css.includes('.chronus-live-media.is-camera-off'), 'portrait fallback styling missing');
assert(css.includes('.chronus-live-media.is-media-empty'), 'empty portrait state styling missing');
assert(css.includes('.chronus-live-participant.is-speaking'), 'active-speaker styling missing');
assert(css.includes('body.in-live-mode .chronus-dice-launcher'), 'global dice launcher must not overlap the live room');
assert(css.includes('body.in-live-mode .chronus-audio-dock'), 'global audio dock must not overlap the live room');
assert(css.includes('min-width: 0'), 'live grid items need an intrinsic overflow guard');
assert(editorialCss.includes('.nav-links-desktop > .nav-desktop-collapsible'), 'desktop navigation must hide secondary routes semantically');
assert(!editorialCss.includes('.nav-links-desktop > li:nth-child'), 'route visibility must not depend on fragile list positions');
assert(preview.includes("page.route('https://cdn.jsdelivr.net/**'"), 'visual QA must isolate Supabase network access');
assert(preview.includes("page.route('https://www.youtube.com/iframe_api'"), 'visual QA must isolate YouTube network access');
assert(preview.includes("waitUntil: 'domcontentloaded'"), 'visual QA must not wait indefinitely for third-party network idle');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
assert.strictEqual(context.window.ChronusLiveV140.mode, 'presence-enabled');
assert.strictEqual(context.window.ChronusLiveV140.marker, 'v1.4.0-prototype');
assert.strictEqual(context.window.ChronusLiveV140.mediaStateFor({ camera: false, portrait: null, cameraArt: null }), 'empty');
assert.strictEqual(context.window.ChronusLiveV140.mediaStateFor({ camera: false, portrait: 'blob:sheet-photo', cameraArt: null }), 'portrait');
assert.strictEqual(context.window.ChronusLiveV140.mediaStateFor({ camera: true, portrait: null, cameraArt: null }), 'camera');

console.log('v1.4.0 CHRONUS LIVE prototype QA: PASS');
