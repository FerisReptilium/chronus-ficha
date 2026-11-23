'use strict';

const assert = require('assert');
const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/sheet-writing-alignment-v15.css', 'utf8');

const sheetLink = index.indexOf('href="css/sheet.css"');
const alignmentLink = index.indexOf('href="css/sheet-writing-alignment-v15.css"');
const resourceLink = index.indexOf('href="css/resource-counters.css"');
assert(sheetLink >= 0 && alignmentLink > sheetLink, 'Writing alignment layer must load after the original sheet stylesheet');
assert(resourceLink < 0 || alignmentLink < resourceLink, 'Writing alignment must load before resource controls');

for (const selector of [
  '#view-sheet .sheet-input:not(textarea):not(.centered-number)',
  '#view-sheet .list-marker-input',
  '#view-sheet .table-input:not(textarea)',
  '#view-sheet .sheet-input.textarea',
  '#view-sheet .table-input.formula-notes',
  '#view-sheet .history-expanded textarea',
  '#view-sheet .expanded-lines input'
]) {
  assert(css.includes(selector), `Missing normalized writing selector: ${selector}`);
}

for (const binding of [
  'personalities.0',
  'personalities.1',
  'magic.instruments',
  'conditions',
  'equipmentImportant'
]) {
  assert(css.includes(`[data-bind="${binding}"]`), `Missing line-rhythm calibration for ${binding}`);
}

assert(css.includes('line-height: 2.7cqw'), 'Main multiline fields must use proportional ruled-line spacing');
assert(css.includes('line-height: 2.38cqw'), 'Page II history must preserve its printed rule pitch');
assert(css.includes('padding-top: 0'), 'Single-line fields must reset inconsistent top padding');
assert(!/^(?:input|textarea)\s*\{/m.test(css), 'Writing styles must not leak into portal authentication or unrelated forms');

console.log('CHRONUS v1.5.3 sheet writing alignment regression: PASS');
