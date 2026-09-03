'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const contentSource = fs.readFileSync(path.join(root, 'js/services/content.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'js/modules/player_dashboard.js'), 'utf8');
const routerSource = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(root, 'css/dashboard.css'), 'utf8');
const editorialSource = fs.readFileSync(path.join(root, 'js/services/editorial.js'), 'utf8');
const narratorSource = fs.readFileSync(path.join(root, 'js/modules/narrator_panel.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(root, 'supabase/migrations/20260903013409_add_session_current_objective.sql'), 'utf8');

const ids = {
  active: '11111111-1111-4111-8111-111111111111',
  next: '22222222-2222-4222-8222-222222222222',
  later: '33333333-3333-4333-8333-333333333333',
  last: '44444444-4444-4444-8444-444444444444'
};

function createHarness(sessionRows = null) {
  const calls = [];
  const sessions = sessionRows || [
    { id: ids.later, session_number: 6, title: 'Eco no Concreto', session_date: '2026-09-17', status: 'planned', current_objective: 'Investigar o eco.' },
    { id: ids.last, session_number: 3, title: 'O Arquivo Cinza', session_date: '2026-09-01', status: 'completed', summary: 'A cabala encontrou a primeira cifra.' },
    { id: ids.next, session_number: 5, title: 'KASSANDRA', session_date: '2026-09-10', status: 'planned', current_objective: 'Chegar ao arquivo antes da Stasi.' },
    { id: ids.active, session_number: 4, title: 'Sinal de Teufelsberg', session_date: '2026-09-03', status: 'in_progress', current_objective: 'Localizar a origem da transmissão.' }
  ];

  const relations = {
    session_npcs: [
      { role_in_session: '<img src=x onerror=alert(1)>', npc: { id: 'a', name: 'Viktor Kane', slug: 'viktor-kane', role_occupation: 'Contato', status: 'alive' } }
    ],
    session_locations: [
      { notes: 'Ponto de escuta', location: { id: 'b', name: 'Teufelsberg', slug: 'teufelsberg', type: 'facility', district_region: 'Charlottenburg' } }
    ],
    session_documents: [
      { discovery_context: 'Recuperado na torre', document: { id: 'c', title: 'Fita K-17', slug: 'fita-k-17', type: 'audio_log' } }
    ]
  };

  const client = {
    from(table) {
      const state = { table, filters: {}, limit: null, statuses: null, select: null };
      calls.push({ type: 'from', table, state });

      const builder = {
        select(columns) { state.select = columns; return builder; },
        in(column, values) { state.statuses = { column, values }; return builder; },
        eq(column, value) { state.filters[column] = value; return builder; },
        order() { return builder; },
        limit(value) { state.limit = value; return builder; },
        then(resolve, reject) {
          let data = table === 'campaign_sessions' ? sessions : (relations[table] || []);
          if (table === 'campaign_sessions' && state.statuses?.column === 'status') {
            data = data.filter(row => state.statuses.values.includes(row.status));
          }
          if (state.limit) data = data.slice(0, state.limit);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };

  const sandbox = {
    console,
    window: { ChronusSupabase: { getClient: () => client } }
  };
  vm.createContext(sandbox);
  vm.runInContext(contentSource, sandbox, { filename: 'content.js' });
  return { api: sandbox.window.ChronusContent, calls };
}

(async () => {
  {
    const { api, calls } = createHarness();
    const briefing = await api.getPlayerBriefing();

    assert.strictEqual(briefing.activeSession.id, ids.active, 'in-progress session must drive the current objective');
    assert.strictEqual(briefing.nextSession.id, ids.next, 'nearest planned date must be the next session');
    assert.strictEqual(briefing.lastSession.id, ids.last, 'latest completed session must drive the previous summary');
    assert.strictEqual(briefing.relationSession.id, ids.active, 'relations must follow the active mission');
    assert.strictEqual(briefing.relations.npcs[0].name, 'Viktor Kane');
    assert.strictEqual(briefing.relations.npcs[0].relation_note, '<img src=x onerror=alert(1)>');
    assert.strictEqual(briefing.relations.locations[0].name, 'Teufelsberg');
    assert.strictEqual(briefing.relations.documents[0].title, 'Fita K-17');

    const sessionQuery = calls.find(call => call.table === 'campaign_sessions');
    assert.deepStrictEqual(
      Array.from(sessionQuery.state.statuses.values),
      ['in_progress', 'planned', 'completed'],
      'briefing query must be explicitly filtered by relevant statuses'
    );
    for (const table of ['session_npcs', 'session_locations', 'session_documents']) {
      const relationQuery = calls.find(call => call.table === table);
      assert.strictEqual(relationQuery.state.filters.session_id, ids.active, `${table} must filter by the active session`);
      assert.strictEqual(relationQuery.state.limit, 6, `${table} must keep dashboard payload bounded`);
    }
  }

  {
    const { api, calls } = createHarness([]);
    const briefing = await api.getPlayerBriefing();
    assert.strictEqual(briefing.activeSession, null);
    assert.strictEqual(briefing.nextSession, null);
    assert.strictEqual(briefing.lastSession, null);
    assert.deepStrictEqual(Object.keys(briefing.relations), ['npcs', 'locations', 'documents']);
    assert.strictEqual(calls.filter(call => call.table.startsWith('session_')).length, 0, 'empty briefing must not query relation tables');
  }

  {
    const { api } = createHarness();
    await assert.rejects(() => api.getSessionRelations('../invalid'), /UUID de sessão inválido/);
  }

  assert(migrationSource.includes('add column if not exists current_objective text'), 'migration must add the nullable objective column');
  assert(migrationSource.includes('idx_campaign_sessions_player_briefing'), 'migration must include the bounded briefing index');
  assert(editorialSource.includes("'summary', 'current_objective', 'events_log'"), 'editorial allowlist must include current_objective');
  assert(narratorSource.includes("name: 'current_objective'"), 'Narrator session form must expose the current objective');
  assert(dashboardSource.includes('getPlayerBriefing()'), 'player dashboard must load the dynamic briefing');
  assert(dashboardSource.includes('container.replaceChildren()'), 'related content must be rendered through safe DOM replacement');
  assert(!dashboardSource.includes('${active.current_objective}'), 'objective must never be interpolated into HTML');
  assert(!dashboardSource.includes('${last.summary}'), 'session summary must never be interpolated into HTML');
  assert(!dashboardSource.includes('${group.getName(item)}'), 'related record names must never be interpolated into HTML');
  assert(routerSource.includes("classList.toggle('in-player-mode', cleanHash === '#/player')"), 'router must expose Player Area layout state');
  assert(dashboardCss.includes('body.in-player-mode .chronus-audio-dock'), 'mobile dashboard must compact the ambient audio control');
  assert(dashboardCss.includes('body.in-player-mode .chronus-dice-launcher'), 'mobile dashboard must compact the dice control');

  console.log('v1.4.3 dynamic player dashboard regression: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
