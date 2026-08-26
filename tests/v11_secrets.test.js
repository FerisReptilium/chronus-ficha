const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'secrets_v11.js'), 'utf8');

function harness(role = 'narrator') {
  const calls = [];
  const rows = new Map();
  const client = {
    from(table) {
      const state = { table, op: null, payload: null, key: null, value: null };
      const b = {
        select() { state.op = state.op || 'select'; return b; },
        eq(key, value) { state.key = key; state.value = value; calls.push({ type:'eq', table, key, value }); return b; },
        maybeSingle() {
          const data = rows.get(`${table}:${state.value}`) || null;
          return Promise.resolve({ data, error: null });
        },
        upsert(payload, options) { state.op='upsert'; state.payload=payload; calls.push({ type:'upsert', table, payload, options }); rows.set(`${table}:${Object.values(payload)[0]}`, payload); return b; },
        single() { return Promise.resolve({ data: state.payload, error: null }); },
        delete() { state.op='delete'; calls.push({ type:'delete', table }); return b; },
        then(resolve, reject) { return Promise.resolve({ data:null, error:null }).then(resolve, reject); }
      };
      return b;
    }
  };
  const sandbox = {
    console,
    window: {
      ChronusAuth: { getProfile: () => ({ role }) },
      ChronusSupabase: { getClient: () => client }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'secrets_v11.js' });
  return { api: sandbox.window.ChronusSecretsV11, calls };
}

(async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  {
    const { api, calls } = harness();
    const result = await api.saveSecret('chapter', id, { hidden_truth: 'Verdade', narrator_notes: 'Nota' });
    assert.strictEqual(result.ok, true);
    const upsert = calls.find(c => c.type === 'upsert');
    assert.ok(upsert);
    assert.strictEqual(upsert.table, 'chapter_secrets');
    assert.strictEqual(upsert.options.onConflict, 'chapter_id');
  }
  {
    const { api } = harness('player');
    const result = await api.saveSecret('npc', id, { secrets: 'X' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_NARRATOR');
  }
  {
    const { api } = harness();
    const result = await api.saveSecret('npc', id, { forbidden: 'X' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_FIELD');
  }
  {
    const { api } = harness();
    const result = await api.getSecret('library', id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_ENTITY');
  }
  console.log('PASS: CHRONUS v1.1 narrator secrets service');
})().catch(err => { console.error(err); process.exit(1); });
