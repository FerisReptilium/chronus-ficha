'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const service = fs.readFileSync('js/services/narrative_live.js', 'utf8');
const live = fs.readFileSync('js/modules/chronus_live_v140.js', 'utf8');
const dice = fs.readFileSync('js/modules/dice_roller_v135.js', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');
const sqlBaseline = fs.readFileSync('tests/chronus_roll_events.sql', 'utf8');
const initialMigration = fs.readFileSync('supabase/migrations/006_chronus_roll_events.sql', 'utf8');
const sessionMigration = fs.readFileSync('supabase/migrations/20261125212222_chronus_live_session_isolation.sql', 'utf8');

assert(service.includes('async function removeChannelSafely(db, previous, context)'), 'Realtime cleanup must be isolated behind a failure-tolerant helper');
assert(service.includes("await removeChannelSafely(client(), previous, 'troca de sessão')"), 'a failed stale-channel cleanup must not abort mounting the next session feed');
assert(service.includes("await removeChannelSafely(db, previous, 'saída da sala')"), 'leaving the LIVE route must tolerate stale-channel cleanup failures');

// Realtime channel removal can reject during network loss; cleanup must resolve
// so the caller can continue mounting the selected session or leaving the route.
let cleanupChecks = Promise.resolve();
{
  const start = service.indexOf('  async function removeChannelSafely(');
  const end = service.indexOf('  async function mountSharedRollFeed(', start);
  assert.ok(start >= 0 && end > start, 'Realtime cleanup helper must remain independently testable');
  const helper = service.slice(start, end);
  const warnings = [];
  const sandbox = { console: { warn(...args) { warnings.push(args); } } };
  vm.createContext(sandbox);
  vm.runInContext(helper, sandbox);
  cleanupChecks = Promise.all([
    sandbox.removeChannelSafely({ async removeChannel() { throw new Error('network unavailable'); } }, { id: 'old-channel' }, 'test'),
    sandbox.removeChannelSafely({}, { id: 'old-channel' }, 'test'),
    sandbox.removeChannelSafely({ async removeChannel() {} }, null, 'test')
  ]).then(() => {
    assert.equal(warnings.length, 1, 'failed channel removal must be logged without rejecting');
  });
}
assert(service.includes('function mountSharedRollFeed(container, sessionId)'), 'session-aware shared feed mount API missing');
assert(service.includes(".eq('session_id', sessionId)"), 'roll history must be filtered to the selected session');
assert(service.includes('chronus-rolls:session:${sessionId}'), 'roll feed must use its own selected-session topic');
assert(service.includes('session_id: sessionId'), 'new roll events must carry the selected session id');
assert(service.includes(".on('postgres_changes'"), 'shared roll feed must subscribe to Postgres INSERT events');
assert(service.includes("table: 'chronus_roll_events'"), 'shared feed must listen to roll event table');
assert(service.includes(".order('created_at', { ascending: false })"), 'shared feed must recover recent history after reconnect/reload');
assert(service.includes(".limit(20)"), 'shared feed history must remain bounded');
assert(service.includes("'● Sincronizada'"), 'connection status must be visible');
assert(service.includes("'Reconectando…'"), 'connection loss must be visible');
assert(service.includes("subscriptionStatus === 'CLOSED'"), 'a permanently closed feed channel must not appear to be reconnecting');
assert(service.includes("'Canal encerrado · tentando restabelecer…'"), 'a closed feed channel must schedule automatic recovery');
assert(service.includes('function scheduleFeedRecovery(container, sessionId, generation)'), 'closed feed recovery must be isolated and testable');
assert(service.includes('Math.min(1000 * (2 ** feedRecoveryAttempt), 30000)'), 'feed recovery backoff must be bounded');
assert(service.includes('feedRecoveryAttempt = 0;'), 'successful reconnect and unmount must reset recovery backoff');
assert(service.includes("if (subscriptionStatus === 'SUBSCRIBED') {") && service.includes('void loadRecentRolls();'), 'history must be reloaded after reconnect');
assert(service.includes('let historyLoaded = false;') && service.includes('let historyPromise = null;'), 'roll history refresh state must be scoped to the mounted session');
assert(service.includes('if (historyLoaded) return;') && service.includes('if (historyPromise) return historyPromise;'), 'duplicate initial and reconnect callbacks must share one history request');
assert(service.includes('if (historyPromise === request) historyPromise = null;'), 'a stale history request must not clear a newer in-flight request');
assert(service.includes('requestEpoch !== historyEpoch'), 'history responses started before a connection interruption must be discarded');
assert(service.includes('historyEpoch += 1;') && service.includes('historyPromise = null;'), 'connection interruptions must invalidate in-flight history and permit a fresh recovery request');
assert(service.includes('feedGeneration += 1'), 'stale async history responses must be invalidated on unmount');
assert(service.includes('function addRecord(record, expectedSessionId, generation)'), 'shared roll events must be validated against their mounted session generation');
assert(service.includes('record.session_id !== expectedSessionId'), 'late events from a previous session must be rejected');
assert(service.includes('generation !== feedGeneration'), 'callbacks from stale feed subscriptions must be rejected');
assert(service.includes('payload => addRecord(payload.new, sessionId, generation)'), 'Realtime INSERT callbacks must carry their originating session and generation');
assert(service.includes("unmountSharedRollFeed: unmountNarratorFeed"), 'shared feed must release its channel');
assert(live.includes("mountSharedRollFeed?.(document.getElementById('chronus-live-feed'), getActiveSessionId())"), 'LIVE route must mount the session-scoped roll feed');
assert(live.includes('function getActiveSessionId()'), 'LIVE must validate the selected session identifier');
assert(live.includes('initializeSessionMembershipControls'), 'Narrator session membership controls must be initialized');
assert(live.includes('let sessionSelectionGeneration = 0;'), 'session selector requests must have an independent generation token');
assert(live.includes('const requestId = ++sessionSelectionGeneration;'), 'each session selector refresh must invalidate older requests');
assert(live.includes('requestId !== sessionSelectionGeneration'), 'late session list responses must be discarded');
assert(live.includes("!window.location.hash.startsWith('#/live')"), 'session list responses must not update the selector after leaving LIVE');
assert(live.includes('catch (error) {') && live.includes("CHRONUS LIVE: falha ao listar sessões autorizadas."), 'unexpected session list failures must be handled visibly');
assert(live.includes("id=\"chronus-live-session-admin\""), 'Narrator session access panel must exist');
assert(live.includes("eq('role', 'player')"), 'membership manager must list player profiles only');
assert(live.includes("from('chronus_live_session_members').insert"), 'Narrator must be able to grant session access through authenticated RLS');
assert(live.includes(".delete().eq('session_id', context.sessionId)"), 'Narrator revocation must target the current session bound to its membership controls');
assert(live.includes('panel._chronusLiveMembership = { sessionId, db, requestId, refresh, select, status }'), 'membership handlers must use the latest active session context');
assert(live.includes('context.requestId !== membershipGeneration'), 'membership actions from a previous session must be rejected');
assert(live.includes('getActiveSessionId() !== context.sessionId'), 'membership actions must never target a session that is no longer selected');
assert(live.includes('falha inesperada ao carregar membros da sessão'), 'unexpected membership refresh rejections must be handled');
assert(live.includes('falha inesperada ao adicionar membro'), 'unexpected membership grant rejections must be handled');
assert(live.includes('falha inesperada ao remover membro'), 'unexpected membership revocation rejections must be handled');
assert(live.includes("'Selecione uma sessão válida'"), 'LIVE must fail closed when no valid session is selected');
assert(live.includes('chronus-live:session:${sessionId}'), 'presence must use a session-specific topic');
assert(router.includes("if (cleanHash !== '#/live')"), 'leaving LIVE must release its realtime subscription');
assert(router.includes('window.ChronusLiveV140?.unmount?.()'), 'leaving LIVE must release authenticated room presence');
assert(live.includes('unmount: disconnectPresence'), 'LIVE module must expose room presence cleanup');
assert(live.includes('const seenUsers = new Set()'), 'multiple browser tabs for one account must not inflate participant count');
assert(dice.includes('Rolagem compartilhada com a mesa.'), 'dice confirmation must identify the whole table');
assert(initialMigration.includes('chronus_roll_events_select_owner_or_narrator'), 'original migration policy must remain auditable');
assert(sqlBaseline.includes('Player A should see only the two events in Session A'), 'database integration test must cover same-session sharing');
assert(sqlBaseline.includes('Player A read a roll from Session B'), 'database integration test must reject cross-session roll visibility');
assert(sessionMigration.includes('chronus_live_session_members'), 'migration must add explicit session membership');
assert(sessionMigration.includes('chronus_roll_events_select_session_members'), 'roll visibility must be session-scoped');
assert(sessionMigration.includes('chronus_live_roll_feed_authenticated_select'), 'private session roll feed channel must require session membership');
assert(sessionMigration.includes('chronus_private.can_access_live_session'), 'presence and roll access must require session membership or narrator role');
assert(sessionMigration.includes("'^chronus-live:session:[0-9a-fA-F-]{36}$'"), 'presence policy must accept only UUID-scoped session topics');
assert(sessionMigration.includes('chronus_live_presence_authenticated_insert') && sessionMigration.includes('FOR INSERT') && sessionMigration.includes('WITH CHECK'), 'authenticated participants must be authorized to publish presence');
assert(sessionMigration.includes('TO authenticated'), 'anonymous users must not join the private presence channel');
assert(live.includes('db.channel(`chronus-live:session:${sessionId}`, { config: { private: true, presence: { key } } })'), 'LIVE must join the selected private session channel with a per-tab key');
assert(live.includes("channel.on('presence', { event: 'sync' }, applyPresenceState)"), 'LIVE must rebuild the roster after presence sync');
assert(live.includes("channel.on('presence', { event: 'join' }, applyPresenceState)"), 'LIVE must update the roster when a participant joins');
assert(live.includes("channel.on('presence', { event: 'leave' }, applyPresenceState)"), 'LIVE must update the roster when a participant leaves');
assert(live.includes('await channel.track({ user_id: user.id, display_name: currentIdentity.displayName, character_name: character })'), 'LIVE presence must be tied to the authenticated user');
assert(live.includes('presenceChannel.presenceState?.()'), 'LIVE roster must come from actual Realtime presence state');
assert(live.includes('isLocalPreview() ? DEFAULT_PARTICIPANTS.map'), 'fictional participants must be limited to localhost visual preview');
assert(live.includes('microphone.disabled = true') && live.includes('camera.disabled = true') && live.includes('share.disabled = true'), 'unimplemented media controls must be disabled, not simulated');
assert(live.includes("mode: 'presence-enabled'"), 'LIVE module must expose presence-enabled mode');
assert(live.includes("status === 'CLOSED'"), 'a closed presence channel must be distinguished from a temporary connection loss');
assert(live.includes("if (result === 'ok')") && live.includes("'Presença não confirmada'"), 'presence tracking must expose unsuccessful acknowledgements instead of leaving a pending state');
assert(live.includes('catch (profileLookupError)'), 'unexpected profile lookup rejections must be handled');
assert(live.includes('catch (sessionLookupError)'), 'unexpected session lookup rejections must be handled');
assert(live.includes("'Falha ao validar perfil'"), 'profile lookup failures must have a distinct visible state');
assert(live.includes("'Falha ao validar sessão'"), 'session lookup failures must have a distinct visible state');
assert(live.includes('function clearLocalPresenceIdentity()'), 'failed presence validation must clear stale local identity');
assert(live.includes("generation !== presenceGeneration || !window.location.hash.startsWith('#/live')"), 'late validation failures must not overwrite a newer route or connection');

// Failed validation must clear stale local identity and remove the local participant.
{
  const start = live.indexOf('  function clearLocalPresenceIdentity() {');
  const end = live.indexOf('  async function connectPresence()', start);
  assert.ok(start >= 0 && end > start, 'presence failure helpers must remain independently testable');
  const helpers = live.slice(start, end);
  const status = { title: '', detail: '' };
  const statusEl = {
    querySelector(selector) {
      if (selector === 'strong') return { set textContent(value) { status.title = value; } };
      if (selector === 'small') return { set textContent(value) { status.detail = value; } };
      return null;
    }
  };
  let renders = 0;
  const sandbox = {
    currentIdentity: { userId: 'stale-user' },
    presenceKey: 'stale-tab',
    state: { participants: [{ id: 'stale-user:tab', isLocal: true }, { id: 'other-user' }] },
    renderAll() { renders += 1; },
    document: { getElementById(id) { return id === 'chronus-live-connection-status' ? statusEl : null; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(helpers + "\nsetPresenceValidationFailure('Falha ao validar perfil', 'Tente atualizar a sala');", sandbox);
  assert.equal(sandbox.currentIdentity, null, 'failed validation must clear stale authenticated identity');
  assert.equal(sandbox.presenceKey, '', 'failed validation must clear the old per-tab presence key');
  assert.deepEqual(sandbox.state.participants.map(item => item.id), ['other-user'], 'failed validation must remove only the stale local participant');
  assert.equal(status.title, 'Falha ao validar perfil', 'the validation failure must be visible');
  assert.equal(status.detail, 'Tente atualizar a sala', 'the recovery instruction must be visible');
  assert.equal(renders, 1, 'the roster must rerender after local identity cleanup');
}

// A second tab for the same account must not steal the current tab's local identity.
{
  const start = live.indexOf('  function applyPresenceState() {');
  const end = live.indexOf('\n  async function disconnectPresence()', start);
  assert.ok(start >= 0 && end > start, 'presence state reducer must remain independently testable');
  const reducer = live.slice(start, end);
  const sandbox = {
    presenceChannel: {
      presenceState: () => ({
        'other-tab': [{ user_id: 'user-a', display_name: 'Felipe', character_name: 'Personagem' }],
        'local-tab': [{ user_id: 'user-a', display_name: 'Felipe', character_name: 'Personagem' }]
      })
    },
    presenceKey: 'local-tab',
    currentIdentity: { displayName: 'Felipe', role: 'player' },
    state: {
      participants: [{ id: 'user-a:local-tab', portrait: 'blob:local-portrait' }],
      spotlightId: 'user-a:other-tab'
    },
    renderAll() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(reducer + '\napplyPresenceState();', sandbox);
  assert.equal(sandbox.state.participants.length, 1, 'duplicate tabs must still render one participant');
  assert.equal(sandbox.state.participants[0].id, 'user-a:local-tab',
    'the current browser tab must win deduplication even when another tab appears first');
  assert.equal(sandbox.state.participants[0].isLocal, true,
    'the current browser tab must retain local participant semantics');
  assert.equal(sandbox.state.participants[0].portrait, 'blob:local-portrait',
    'the current tab must retain its hydrated portrait');
}


// Closed Realtime channels retry with bounded backoff and ignore stale-session timers.
{
  const start = service.indexOf('  function scheduleFeedRecovery(');
  const end = service.indexOf('  async function mountSharedRollFeed(', start);
  assert.ok(start >= 0 && end > start, 'feed recovery scheduler must remain independently testable');
  const scheduler = service.slice(start, end);
  const scheduled = [];
  const sandbox = {
    feedRecoveryTimer: null,
    feedRecoveryAttempt: 0,
    feedGeneration: 4,
    mountedRoot: null,
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; },
    recoveredCalls: [],
    mountSharedRollFeed: (container, sessionId) => { sandbox.recoveredCalls.push({ container, sessionId }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(scheduler, sandbox);
  const container = { isConnected: true };
  sandbox.mountedRoot = container;
  sandbox.scheduleFeedRecovery(container, 'session-a', 4);
  sandbox.scheduleFeedRecovery(container, 'session-a', 4);
  assert.equal(scheduled.length, 1, 'only one recovery timer may be pending per feed');
  assert.equal(scheduled[0].delay, 1000, 'first recovery attempt must wait one second');
  scheduled[0].callback();
  assert.deepEqual(sandbox.recoveredCalls, [{ container, sessionId: 'session-a' }], 'valid recovery must remount the same session feed');
  sandbox.feedGeneration = 5;
  sandbox.scheduleFeedRecovery(container, 'session-a', 4);
  assert.equal(scheduled[1].delay, 2000, 'subsequent recovery attempts must use exponential backoff');
  scheduled[1].callback();
  assert.equal(sandbox.recoveredCalls.length, 1, 'a timer from an obsolete feed generation must not remount a stale session');
}

// A delayed INSERT from a previous session must not contaminate the newly mounted feed.
{
  const start = service.indexOf('  function addRecord(');
  const finish = service.indexOf('  function renderFeed()', start);
  assert.ok(start >= 0 && finish > start, 'feed record reducer must remain independently testable');
  const reducer = service.slice(start, finish);
  let renders = 0;
  const sandbox = {
    feedGeneration: 7,
    mountedRoot: { isConnected: true },
    records: new Map(),
    renderFeed() { renders += 1; }
  };
  vm.createContext(sandbox);
  vm.runInContext(reducer, sandbox);
  sandbox.addRecord({ id: 'stale-generation', session_id: 'session-a', created_at: '2026-11-26T00:00:00Z' }, 'session-a', 6);
  sandbox.addRecord({ id: 'wrong-session', session_id: 'session-a', created_at: '2026-11-26T00:00:01Z' }, 'session-b', 7);
  assert.equal(sandbox.records.size, 0, 'stale generation and mismatched session events must both be discarded');
  assert.equal(renders, 0, 'discarded events must not render into the active feed');
  sandbox.addRecord({ id: 'current-session', session_id: 'session-b', created_at: '2026-11-26T00:00:02Z' }, 'session-b', 7);
  assert.deepEqual(Array.from(sandbox.records.keys()), ['current-session'], 'only the active session event may enter the feed');
  assert.equal(renders, 1, 'the active session event should render once');
  sandbox.addRecord({ id: 'current-session', session_id: 'session-b', created_at: '2026-11-26T00:00:02Z' }, 'session-b', 7);
  assert.equal(sandbox.records.size, 1, 'duplicate history and Realtime delivery must remain idempotent');
  assert.equal(renders, 1, 'duplicate immutable INSERTs must not trigger another feed render');
}

cleanupChecks.then(() => console.log('CHRONUS session-scoped LIVE roll feed regression: PASS')).catch(error => { console.error(error); process.exitCode = 1; });
