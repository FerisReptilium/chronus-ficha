'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261123000000_narrator_campaign_admin_sheet_editing.sql', 'utf8');
const engine = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');
const panel = fs.readFileSync('js/modules/narrator_panel.js', 'utf8');
const css = fs.readFileSync('css/narrator.css', 'utf8');
const baseline = fs.readFileSync('tests/core_database_baseline.sql', 'utf8');

assert.match(migration, /CREATE POLICY characters_update_owner_or_narrator[\s\S]*?FOR UPDATE[\s\S]*?chronus_private\.is_chronus_narrator\(\)/);
assert.match(migration, /WITH CHECK[\s\S]*?chronus_private\.is_chronus_narrator\(\)/);
assert.match(migration, /prevent_character_owner_change/);
assert.match(migration, /NEW\.user_id IS DISTINCT FROM OLD\.user_id/);
assert.match(migration, /ERRCODE = '42501'/);

const save = engine.slice(engine.indexOf('async function pushStateToCloud()'), engine.indexOf('async function pushStateToCloudConfirmed()'));
assert.match(save, /\.eq\('user_id', cloudUser\.id\)/, 'Cloud writes must remain scoped to the target sheet owner');
assert.match(save, /\.eq\('revision', cloudVersion\)/, 'Narrator edits must preserve monotonic CAS');
const confirmed = engine.slice(engine.indexOf('async function pushStateToCloudConfirmed()'), engine.indexOf('// Inicializar o DOM da ficha'));
assert.match(confirmed, /\.eq\('user_id', cloudUser\.id\)/);
assert.match(confirmed, /\.eq\('revision', expectedVersion\)/);

const narratorMode = engine.slice(engine.indexOf('function applyNarratorEditMode'), engine.indexOf('async function bootstrapRoleForUser'));
assert.match(narratorMode, /narratorReadOnly=false/);
assert.match(narratorMode, /bootstrapNarratorCharacter/);
assert.match(narratorMode, /\.eq\('id',meta\.character_id\)/);
assert.match(narratorMode, /\.eq\('user_id',meta\.user_id\)/);
assert.match(narratorMode, /applyRemoteAndReload\(character\.data,meta\.user_id,character\.id,character\.revision\)/);
assert.match(narratorMode, /Voltar ao Painel do Narrador/);
assert.match(panel, /Editar Ficha do Jogador/);
assert.match(css, /\.narrator-admin-editing #narratorViewBanner/);
assert.match(baseline, /Narrator should update player sheet content/);
assert.match(baseline, /Narrator must not be able to transfer character ownership/);

console.log('PASS v1.6.1 narrator campaign-admin sheet editing, ownership guard and CAS regression');
