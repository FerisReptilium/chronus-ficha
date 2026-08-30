'use strict';

const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const app = read('js/app.js');
const moduleSource = read('js/modules/hero_video_v135.js');
const css = read('css/hero-video-v135.css');

assert(app.includes("loadScriptOnce('js/modules/hero_video_v135.js')"), 'v1.3.5 hero video module must load from bootstrap');
assert(app.includes('if (editorialV132Ready)'), 'video must only enhance the approved editorial hero');
assert(moduleSource.includes("'assets/video/v135-hero-berlin-loop.webm'"), 'WebM source missing');
assert(moduleSource.includes("'assets/video/v135-hero-berlin-loop.mp4'"), 'MP4 fallback missing');
assert(moduleSource.includes("'assets/video/v135-hero-berlin-poster.webp'"), 'static poster missing');
assert(moduleSource.includes("window.matchMedia('(prefers-reduced-motion: reduce)')"), 'reduced-motion query missing');
assert(moduleSource.includes("window.matchMedia('(max-width: 760px)')"), 'mobile poster query missing');
assert(moduleSource.includes("navigator.connection?.saveData !== true"), 'data-saver fallback missing');
assert(moduleSource.includes('video.autoplay = true'), 'autoplay missing');
assert(moduleSource.includes('video.muted = true'), 'muted playback missing');
assert(moduleSource.includes('video.loop = true'), 'loop playback missing');
assert(moduleSource.includes('video.playsInline = true'), 'inline mobile playback contract missing');
assert(moduleSource.includes("video.setAttribute('aria-hidden', 'true')"), 'decorative video must be hidden from assistive technology');
assert(moduleSource.includes("document.documentElement.dataset.chronusHeroVideo = 'v1.3.5-preview'"), 'preview readiness marker missing');
assert(css.includes('@media (max-width: 760px), (prefers-reduced-motion: reduce)'), 'poster fallback CSS missing');
assert(css.includes("url('../assets/video/v135-hero-berlin-poster.webp')"), 'poster must remain the CSS background');

for (const asset of [
  'assets/video/v135-hero-berlin-loop.webm',
  'assets/video/v135-hero-berlin-loop.mp4',
  'assets/video/v135-hero-berlin-poster.webp'
]) {
  assert(fs.existsSync(asset), `v1.3.5 asset missing: ${asset}`);
}

console.log('v1.3.5 cinematic hero video static QA: PASS');
