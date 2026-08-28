'use strict';

const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const app = read('js/app.js');
const moduleSource = read('js/modules/ambient_audio_v134.js');
const css = read('css/ambient-audio-v134.css');

assert(app.includes("loadScriptOnce('js/modules/ambient_audio_v134.js')"), 'v1.3.4 audio module must load from bootstrap');
assert(moduleSource.includes("const VIDEO_ID = 'hytkruP8wJk'"), 'approved YouTube video id missing');
assert(moduleSource.includes('https://www.youtube.com/iframe_api'), 'YouTube iframe API must be used');
assert(moduleSource.includes("host: 'https://www.youtube-nocookie.com'"), 'privacy-enhanced YouTube host missing');
assert(moduleSource.includes('autoplay: 1'), 'autoplay attempt missing');
assert(moduleSource.includes('loop: 1'), 'single-video loop missing');
assert(moduleSource.includes('playlist: VIDEO_ID'), 'YouTube single-video loop playlist missing');
assert(moduleSource.includes("window.localStorage.setItem(STORAGE_KEY"), 'audio preference persistence missing');
assert(moduleSource.includes("document.documentElement.dataset.chronusAudio = 'v1.3.4-preview'"), 'v1.3.4 audio readiness marker missing');
assert(moduleSource.includes("status.textContent = 'Preparando'"), 'accessible audio status missing');
assert(moduleSource.includes('aria-pressed'), 'toggle pressed state missing');
assert(moduleSource.includes('noopener noreferrer'), 'external source link must be isolated');
assert(!moduleSource.includes('.mp3'), 'portal must not copy or self-host the YouTube audio');
assert(css.includes('.chronus-audio-dock'), 'audio dock styling missing');
assert(css.includes('@media (max-width: 560px)'), 'mobile audio dock styling missing');
assert(css.includes('prefers-reduced-motion: reduce'), 'reduced-motion audio fallback missing');
assert(css.includes('@media print'), 'audio dock must be excluded from print');

console.log('v1.3.4 ambient audio static QA: PASS');
