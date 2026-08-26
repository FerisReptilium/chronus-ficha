const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'relations_v11.js'), 'utf8');

function harness(config = {}) {
  const calls = [];
  const existing = config.existing || [];
  const client = {
    from(table) {
      const state = { table, op: 'select', ownerKey: null, ownerValue: null, targetKey: null, targetValues: null, payload: null };
      const b = {
        select() { state.op = 'select'; return b; },
        eq(key, value) { state.ownerKey = key; state.ownerValue = value; calls.push({ type:'eq', table, key, value }); return b; },
        delete() { state.op = 'delete'; calls.push({ type:'delete', table }); return b; },
        in(key, values) { state.targetKey = key; state.targetValues = values; calls.push({ type:'in', table, key, values }); return Promise.resolve({ data:null, error:null }); },
        upsert(payload, options) { state.op = 'upsert'; state.payload = payload; calls.push({ type:'upsert', table, payload, options }); return Promise.resolve({ data:null, error:null }); },
        then(resolve, reject) {
          if (state.op === 'select') return Promise.resolve({ data: existing, error:null }).then(resolve, reject);
          return Promise.resolve({ data:null, error:null }).then(resolve, reject);
        }
      };
      return b;
    }
  };
  const sandbox = {
    console,
    window: {
      ChronusAuth: { getProfile: () => ({ role: config.role || 'narrator' }) },
      ChronusSupabase: { getClient: () => client }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'relations_v11.js' });
  return { api: sandbox.window.ChronusRelationsV11, calls };
}

(async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const a = '22222222-2222-4222-8222-222222222222';
  const b = '33333333-3333-4333-8333-333333333333';

  {
    const { api, calls } = harness({ existing: [{ session_id: owner, npc_id: a, role_in_session: 'Contato' }] });
    const result = await api.saveRelations('session_npcs', owner, [{ target_id: b, metadata: 'Antagonista' }]);
    assert.strictEqual(result.ok, true);
    assert.ok(calls.some(c => c.type === 'delete'));
    const upsert = calls.find(c => c.type === 'upsert');
    assert.ok(upsert);
    assert.strictEqual(upsert.table, 'session_npcs');
    assert.strictEqual(upsert.options.onConflict, 'session_id,npc_id');
    assert.strictEqual(upsert.payload[0].role_in_session, 'Antagonista');
  }

  {
    const { api } = harness({ role: 'player' });
    const result = await api.saveRelations('chapter_npcs', owner, [{ target_id: a }]);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_NARRATOR');
  }

  {
    const { api } = harness();
    const result = await api.saveRelations('unknown', owner, []);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_RELATION');
  }

  console.log('PASS: CHRONUS v1.1 relations service');
})().catch(err => { console.error(err); process.exit(1); });
