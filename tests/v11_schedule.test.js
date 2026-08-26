const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'schedule_v11.js'), 'utf8');

function harness(config = {}) {
  const calls = [];
  const client = {
    from(table) {
      const state = { table, op: null, payload: null, match: null };
      const b = {
        select() { state.op = state.op || 'select'; return b; },
        eq(key, value) { calls.push({ type:'eq', table, key, value }); return b; },
        single() {
          if (state.op === 'update') return Promise.resolve({ data: { id:'11111111-1111-4111-8111-111111111111', ...state.payload }, error:null });
          return Promise.resolve({ data: { id:'11111111-1111-4111-8111-111111111111', published:false, published_at:null }, error:null });
        },
        update(payload) { state.op='update'; state.payload=payload; calls.push({ type:'update', table, payload }); return b; },
        match(value) { state.match=value; calls.push({ type:'match', table, value }); return Promise.resolve({ data:null, error: config.portalError && table === 'portal_assets' ? config.portalError : null }); },
        then(resolve, reject) { return Promise.resolve({ data:null, error:null }).then(resolve, reject); }
      };
      return b;
    }
  };
  const sandbox = {
    console,
    Date,
    window: {
      ChronusAuth: { getProfile: () => ({ role: config.role || 'narrator' }) },
      ChronusSupabase: { getClient: () => client }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'schedule_v11.js' });
  return { api: sandbox.window.ChronusScheduleV11, calls };
}

(async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const future = new Date(Date.now() + 3600000).toISOString();

  {
    const { api, calls } = harness();
    const result = await api.schedulePublication('chapter', id, future);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.scheduled, true);
    const parentUpdate = calls.find(c => c.type === 'update' && c.table === 'chronicle_chapters');
    const assetUpdate = calls.find(c => c.type === 'update' && c.table === 'portal_assets');
    assert.ok(parentUpdate);
    assert.ok(assetUpdate);
    assert.strictEqual(parentUpdate.payload.published, true);
    assert.ok(Date.parse(parentUpdate.payload.published_at) > Date.now());
  }

  {
    const { api } = harness();
    const result = await api.schedulePublication('chapter', id, new Date(Date.now() - 60000).toISOString());
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_DATE');
  }

  {
    const { api, calls } = harness();
    const result = await api.cancelSchedule('soundtrack', id);
    assert.strictEqual(result.ok, true);
    assert.ok(calls.some(c => c.type === 'update' && c.table === 'soundtrack' && c.payload.published === false));
    assert.ok(!calls.some(c => c.table === 'portal_assets'));
  }

  {
    const { api } = harness({ role:'player' });
    const result = await api.schedulePublication('npc', id, future);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_NARRATOR');
  }

  console.log('PASS: CHRONUS v1.1 scheduled publication service');
})().catch(err => { console.error(err); process.exit(1); });
