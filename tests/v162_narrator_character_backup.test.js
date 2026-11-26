'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const panel = fs.readFileSync('js/modules/narrator_panel.js', 'utf8');
const css = fs.readFileSync('css/narrator.css', 'utf8');

assert.match(panel, /CHARACTER_BACKUP_FORMAT = 'chronus-character-backup'/);
assert.match(panel, /CHARACTER_BACKUP_VERSION = 1/);
assert.match(panel, /scope: 'character'/);
assert.match(panel, /scope: 'campaign'/);
assert.match(panel, /⬇ Backup da Mesa/);
assert.match(panel, /⬇ Exportar ficha/);
assert.match(panel, /↥ Restaurar backup/);
assert.match(panel, /CHARACTER_BACKUP_MAX_BYTES = 2 \* 1024 \* 1024/);
assert.match(panel, /hasUnsafeBackupKeys\(payload\)/);
assert.match(panel, /incoming\.id !== targetCharacter\.id \|\| incoming\.user_id !== targetCharacter\.user_id/);
assert.match(panel, /Array\.isArray\(data\.personalities\)/);
assert.match(panel, /Array\.isArray\(data\.lists\[key\]\)/);
assert.match(panel, /window\.confirm\([\s\S]*?RESTAURAR FICHA/);
assert.match(panel, /\.eq\('id', targetCharacter\.id\)/);
assert.match(panel, /\.eq\('user_id', targetCharacter\.user_id\)/);
assert.match(panel, /\.eq\('revision', targetCharacter\.revision\)/);
assert.match(panel, /\.select\('id, revision, updated_at'\)/);
assert.match(panel, /if \(!data\) throw new Error\('Conflito de versão/);
assert.match(panel, /Não foi possível restaurar o backup/);
assert.match(css, /\.narrator-backup-actions/);

console.log('PASS v1.6.2 narrator backup export, schema validation, owner binding and CAS restore regression');
