const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const extensionPath = path.join(__dirname, '..', 'js', 'services', 'editorial_v11.js');
const source = fs.readFileSync(extensionPath, 'utf8');

function makeQuery(handler) {
  const state = { table: null, op: null, filters: {}, match: null, in: null };
  const chain = {
    select() { if (!state.op) state.op = 'select'; return chain; },
    delete() { state.op = 'delete'; return chain; },
    eq(key, value) { state.filters[key] = value; return chain; },
    match(value) { state.match = value; return handler(state); },
    in(key, values) { state.in = { key, values }; return handler(state); },
    single() { return handler(state); },
    then(resolve, reject) { return Promise.resolve(handler(state)).then(resolve, reject); }
  };
  return { chain, state };
}

function createHarness({
  role = 'narrator',
  parentExists = true,
  assets = [],
  storageError = null,
  catalogDeleteError = null,
  parentDeleteError = null
} = {}) {
  const calls = [];
  const client = {
    from(table) {
      const query = makeQuery((state) => {
        calls.push({ type: 'db', table, op: state.op, filters: { ...state.filters }, match: state.match, in: state.in });

        if (table === 'portal_assets' && state.op === 'select') {
          return Promise.resolve({ data: assets, error: null });
        }
        if (table === 'portal_assets' && state.op === 'delete') {
          return Promise.resolve({ data: null, error: catalogDeleteError });
        }
        if (state.op === 'select') {
          return Promise.resolve({
            data: parentExists ? { id: state.filters.id } : null,
            error: parentExists ? null : { code: 'PGRST116', message: 'not found' }
          });
        }
        if (state.op === 'delete') {
          return Promise.resolve({
            data: parentDeleteError ? null : { id: state.filters.id },
            error: parentDeleteError
          });
        }
        return Promise.resolve({ data: null, error: null });
      });
      return query.chain;
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            calls.push({ type: 'storage-remove', bucket, paths: [...paths] });
            return { data: null, error: storageError };
          }
        };
      }
    }
  };

  const sandbox = {
    console,
    window: {
      ChronusEditorial: {},
      ChronusAuth: {
        getProfile: () => ({ role })
      },
      ChronusSupabase: {
        getClient: () => client
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'editorial_v11.js' });

  return {
    api: sandbox.window.ChronusEditorial,
    calls
  };
}

(async () => {
  const UUID = '11111111-1111-4111-8111-111111111111';

  {
    const { api } = createHarness({ role: 'player' });
    const result = await api.deleteContent('chapter', UUID, { confirmed: true });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_NARRATOR');
  }

  {
    const { api } = createHarness();
    const result = await api.deleteContent('chapter', UUID);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CONFIRMATION_REQUIRED');
  }

  {
    const { api } = createHarness();
    const result = await api.deleteContent('chapter', 'not-a-uuid', { confirmed: true });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_ID');
  }

  {
    const { api, calls } = createHarness();
    const result = await api.deleteContent('soundtrack', UUID, { confirmed: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.warning, undefined);
    assert.strictEqual(result.data.cleanup.attempted, 0);
    assert.ok(calls.some(c => c.type === 'db' && c.table === 'soundtrack' && c.op === 'delete'));
  }

  {
    const assets = [
      { id: 'a1', bucket_id: 'campaign-images', object_path: 'chapters/x/one.webp' },
      { id: 'a2', bucket_id: 'campaign-images', object_path: 'chapters/x/two.webp' }
    ];
    const { api, calls } = createHarness({ assets });
    const result = await api.deleteContent('chapter', UUID, { confirmed: true });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.cleanup.attempted, 2);
    assert.strictEqual(result.data.cleanup.removed, 2);
    assert.strictEqual(result.data.cleanup.pending, 0);

    const parentDeleteIndex = calls.findIndex(c => c.type === 'db' && c.table === 'chronicle_chapters' && c.op === 'delete');
    const storageIndex = calls.findIndex(c => c.type === 'storage-remove');
    const catalogDeleteIndex = calls.findIndex(c => c.type === 'db' && c.table === 'portal_assets' && c.op === 'delete');

    assert.ok(parentDeleteIndex >= 0);
    assert.ok(storageIndex > parentDeleteIndex);
    assert.ok(catalogDeleteIndex > storageIndex);
  }

  {
    const assets = [
      { id: 'a1', bucket_id: 'documents', object_path: 'documents/x/file.pdf' }
    ];
    const { api, calls } = createHarness({
      assets,
      storageError: { message: 'storage unavailable' }
    });

    const result = await api.deleteContent('document', UUID, { confirmed: true });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.warning, 'ASSET_CLEANUP_PENDING');
    assert.strictEqual(result.data.cleanup.pending, 1);
    assert.ok(calls.some(c => c.type === 'storage-remove'));
    assert.ok(!calls.some(c => c.type === 'db' && c.table === 'portal_assets' && c.op === 'delete'));
  }

  {
    const assets = [
      { id: 'a1', bucket_id: 'library', object_path: 'library/x/file.pdf' }
    ];
    const { api, calls } = createHarness({
      assets,
      catalogDeleteError: { message: 'catalog unavailable' }
    });

    const result = await api.deleteContent('library', UUID, { confirmed: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.warning, 'ASSET_CLEANUP_PENDING');
    assert.strictEqual(result.data.cleanup.pending, 1);
    assert.ok(calls.some(c => c.type === 'storage-remove'));
    assert.ok(calls.some(c => c.type === 'db' && c.table === 'portal_assets' && c.op === 'delete'));
  }

  {
    const assets = [
      { id: 'a1', bucket_id: 'library', object_path: 'library/x/file.pdf' }
    ];
    const { api, calls } = createHarness({
      assets,
      parentDeleteError: { code: '42501', message: 'denied' }
    });

    const result = await api.deleteContent('library', UUID, { confirmed: true });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RLS_DENIED');
    assert.ok(!calls.some(c => c.type === 'storage-remove'));
  }

  console.log('PASS: CHRONUS v1.1 secure DELETE tests');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
