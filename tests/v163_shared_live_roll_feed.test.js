'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('js/services/narrative_live.js', 'utf8');
const live = fs.readFileSync('js/modules/chronus_live_v140.js', 'utf8');
const dice = fs.readFileSync('js/modules/dice_roller_v135.js', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261123010000_shared_roll_visibility.sql', 'utf8');
const sqlBaseline = fs.readFileSync('tests/chronus_roll_events.sql', 'utf8');
const initialMigration = fs.readFileSync('supabase/migrations/006_chronus_roll_events.sql', 'utf8');
const presenceMigration = fs.readFileSync('supabase/migrations/20261123020000_chronus_live_presence_access.sql', 'utf8');

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
assert(router.includes('window.ChronusLiveV140?.unmount?.()'), 'leaving LIVE must release authenticated room presence');
assert(live.includes('unmount: disconnectPresence'), 'LIVE module must expose room presence cleanup');
assert(live.includes('const seenUsers = new Set()'), 'multiple browser tabs for one account must not inflate participant count');
assert(dice.includes('Rolagem compartilhada com a mesa.'), 'dice confirmation must identify the whole table');
assert(migration.includes('chronus_roll_events_select_table_players'), 'player SELECT policy missing');
assert(migration.includes("p.role = 'player'"), 'policy must require a trusted player profile');
assert(migration.includes('chronus_private.is_chronus_narrator()'), 'Narrator visibility must be preserved');
assert(migration.includes('single shared CHRONUS chronicle'), 'global visibility limitation must be documented');
assert(initialMigration.includes('chronus_roll_events_select_owner_or_narrator'), 'original migration policy must remain auditable');
assert(sqlBaseline.includes('Player A sees the shared table events'), 'database integration test must cover cross-player visibility');
assert(presenceMigration.includes('ON realtime.messages'), 'private LIVE presence policy must target Realtime messages');
assert(presenceMigration.includes('chronus_live_presence_authenticated_insert') && presenceMigration.includes('FOR INSERT') && presenceMigration.includes('WITH CHECK'), 'authenticated participants must be authorized to publish presence');
assert(presenceMigration.includes("realtime.topic() = 'chronus-live:main-table'"), 'presence policy must be scoped to the single LIVE room topic');
assert(presenceMigration.includes("p.role IN ('player', 'narrator')"), 'presence access must require a trusted player or narrator profile');
assert(presenceMigration.includes('TO authenticated'), 'anonymous users must not join the private presence channel');
assert(live.includes("channel('chronus-live:main-table', { config: { private: true, presence: { key } } })"), 'LIVE must join the fixed private presence channel with a per-tab key');
assert(live.includes("channel.on('presence', { event: 'sync' }, applyPresenceState)"), 'LIVE must rebuild the roster after presence sync');
assert(live.includes("channel.on('presence', { event: 'join' }, applyPresenceState)"), 'LIVE must update the roster when a participant joins');
assert(live.includes("channel.on('presence', { event: 'leave' }, applyPresenceState)"), 'LIVE must update the roster when a participant leaves');
assert(live.includes('await channel.track({ user_id: user.id, display_name: currentIdentity.displayName, character_name: character })'), 'LIVE presence must be tied to the authenticated user');
assert(live.includes("presenceChannel.presenceState?.()"), 'LIVE roster must come from actual Realtime presence state');
assert(live.includes("isLocalPreview() ? DEFAULT_PARTICIPANTS.map"), 'fictional participants must be limited to localhost visual preview');
assert(live.includes("microphone.disabled = true") && live.includes("camera.disabled = true") && live.includes("share.disabled = true"), 'unimplemented media controls must be disabled, not simulated');
assert(live.includes("mode: 'presence-enabled'"), 'LIVE module must expose presence-enabled mode');


console.log('CHRONUS shared live roll feed regression: PASS');
