'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('js/services/narrative_live.js', 'utf8');
const live = fs.readFileSync('js/modules/chronus_live_v140.js', 'utf8');
const dice = fs.readFileSync('js/modules/dice_roller_v135.js', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261123010000_shared_roll_visibility.sql', 'utf8');
const sqlBaseline = fs.readFileSync('tests/chronus_roll_events.sql', 'utf8');

assert(service.includes("function mountSharedRollFeed(container)"), 'shared feed mount API missing');
assert(service.includes(".on('postgres_changes'"), 'shared roll feed must subscribe to Postgres INSERT events');
assert(service.includes("table: 'chronus_roll_events'"), 'shared feed must listen to roll event table');
assert(service.includes(".order('created_at', { ascending: false })"), 'shared feed must recover recent history after reconnect/reload');
assert(service.includes(".limit(20)"), 'shared feed history must remain bounded');
assert(service.includes("'● Sincronizada'"), 'connection status must be visible');
assert(service.includes("'Reconectando…'"), 'connection loss must be visible');
assert(service.includes("if (subscriptionStatus === 'SUBSCRIBED') void loadRecentRolls();"), 'history must be reloaded after reconnect');
assert(service.includes('feedGeneration += 1'), 'stale async history responses must be invalidated on unmount');
assert(service.includes("unmountSharedRollFeed: unmountNarratorFeed"), 'shared feed must release its channel');
assert(live.includes("mountSharedRollFeed?.(document.getElementById('chronus-live-feed'))"), 'LIVE route must mount the shared roll feed');
assert(router.includes("if (cleanHash !== '#/live')"), 'leaving LIVE must release its realtime subscription');
assert(dice.includes('Rolagem compartilhada com a mesa.'), 'dice confirmation must identify the whole table');
assert(migration.includes('chronus_roll_events_select_table_players'), 'player SELECT policy missing');
assert(migration.includes("p.role = 'player'"), 'policy must require a trusted player profile');
assert(migration.includes('chronus_private.is_chronus_narrator()'), 'Narrator visibility must be preserved');
assert(migration.includes('single shared CHRONUS chronicle'), 'global visibility limitation must be documented');
assert(sqlBaseline.includes('chronus_roll_events_select_owner_or_narrator'), 'baseline policy expectation must remain covered by its original migration tests');

console.log('CHRONUS shared live roll feed regression: PASS');
