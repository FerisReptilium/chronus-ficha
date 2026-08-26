const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'library_v11.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

assert.ok(app.includes("'js/modules/library_v11.js'"), 'app.js must load library_v11.js');
assert.ok(ui.includes('createLibraryItemWithFile'), 'UI must call composite Library CREATE service');
assert.ok(ui.includes("pdfInput.accept = 'application/pdf'"), 'UI must restrict chooser to PDF');
assert.ok(ui.includes("file.type !== 'application/pdf'"), 'UI must validate PDF MIME defensively');
assert.ok(ui.includes("button.textContent = '+ Novo Item com PDF'"), 'Library create button must exist');
assert.ok(ui.includes("window.ChronusAuth?.getProfile?.()?.role !== 'narrator'"), 'UI must gate narrator role');
assert.ok(!ui.includes('.from('), 'UI must not call Supabase tables directly');
assert.ok(!ui.includes('.storage'), 'UI must not call Storage directly');
assert.ok(ui.includes('rascunho exclusivo do Narrador'), 'Success message must preserve narrator-only draft semantics');
assert.ok(ui.includes('Existem dados não enviados'), 'Dirty form close protection must exist');

console.log('PASS: CHRONUS v1.1 Library CREATE UI regression');
