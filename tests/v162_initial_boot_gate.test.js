'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/portal.css', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

assert.match(html, /<body class="chronus-booting">/, 'The document must start in the boot-gated state.');
assert.match(html, /id="chronus-boot-screen"/, 'A visible loading screen must cover the provisional interface.');
assert.match(css, /\.chronus-boot-screen\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*100000;/, 'The loading screen must cover all portal layers.');
assert.match(app, /try\s*\{[\s\S]*?ChronusSupabase\.init\(\)[\s\S]*?ChronusAuth\.init\(\)[\s\S]*?ChronusRouter\.init\(\)/, 'The critical startup sequence must run before the gate is released.');
assert.match(app, /finally\s*\{[\s\S]*?classList\.remove\('chronus-booting'\)[\s\S]*?chronus-boot-screen/, 'The boot gate must always be released after startup settles.');
assert.match(app, /id="chronus-boot-error"/, 'A critical startup failure must preserve a recovery screen.');
assert.match(app, /chronus-boot-retry[\s\S]*?location\.reload\(\)/, 'The recovery screen must provide a working retry action.');

console.log('CHRONUS initial boot gate: PASS');
