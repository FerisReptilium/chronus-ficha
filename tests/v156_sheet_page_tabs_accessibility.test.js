'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const engine = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');

assert(html.includes('<nav class="tabs" role="tablist" aria-label="Páginas da ficha">'), 'Sheet navigation must expose a tablist');
for (const [id, panel, selected, tabIndex] of [
  ['sheet-tab-page-1', 'page-1', 'true', '0'],
  ['sheet-tab-page-2', 'page-2', 'false', '-1']
]) {
  assert(html.includes(`id="${id}" role="tab" aria-controls="${panel}" aria-selected="${selected}" tabindex="${tabIndex}"`), `${id} must expose its selected and keyboard-focus state`);
  assert(html.includes(`id="${panel}"`) && html.includes(`aria-labelledby="${id}"`), `${panel} must be labelled by its tab`);
}
assert(html.includes('aria-label="Histórico do personagem"'), 'Page II history textarea must have an accessible name');
assert(engine.includes('function syncPageAccessibility(activeId)'), 'Page activation must synchronize accessible panel state');
assert(engine.includes("page.setAttribute('aria-hidden', String(!active))"), 'Inactive page must be hidden from assistive technology');
assert(engine.includes('page.inert = !active'), 'Inactive page controls must be removed from keyboard interaction');
assert(engine.includes("event.key === 'ArrowRight' || event.key === 'ArrowDown'"), 'Arrow navigation must move to the next tab');
assert(engine.includes("event.key === 'ArrowLeft' || event.key === 'ArrowUp'"), 'Arrow navigation must move to the previous tab');
assert(engine.includes("event.key === 'Home'"), 'Home must focus the first tab');
assert(engine.includes("event.key === 'End'"), 'End must focus the last tab');

console.log('CHRONUS v1.5.6 sheet page tabs accessibility regression: PASS');
