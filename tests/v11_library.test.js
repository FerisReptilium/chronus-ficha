const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'services', 'editorial_v11.js'),
  'utf8'
);

function makeBuilder(table, calls, config) {
  const state = { table, op: null, payload: null, match: null };
  const builder = {
    insert(payload) {
      state.op = 'insert';
      state.payload = payload;
      calls.push({ type: 'db-insert', table, payload });
      return builder;
    },
    select() { return builder; },
    single() {
      if (table === 'library_items' && state.op === 'insert') {
        if (config.parentInsertError) return Promise.resolve({ data: null, error: config.parentInsertError });
        return Promise.resolve({ data: { ...state.payload }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    delete() {
      state.op = 'delete';
      calls.push({ type: 'db-delete', table });
      return builder;
    },
    match(value) {
      state.match = value;
      calls.push({ type: 'db-match', table, value });
      if (table === 'portal_assets' && state.op === 'delete') {
        return Promise.resolve({ data: null, error: config.catalogDeleteError || null });
      }
      return builder;
    },
    eq() { return builder; },
    in() { return Promise.resolve({ data: null, error: null }); },
    then(resolve, reject) {
      if (table === 'portal_assets' && state.op === 'insert') {
        return Promise.resolve({
          data: null,
          error: config.portalInsertError || null
        }).then(resolve, reject);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }
  };
  return builder;
}

function harness(config = {}) {
  const calls = [];
  let uuidCounter = 0;
  const uuids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  ];

  const client = {
    storage: {
      from(bucket) {
        return {
          async upload(objectPath, file, options) {
            calls.push({ type: 'storage-upload', bucket, objectPath, file, options });
            return { data: null, error: config.storageUploadError || null };
          },
          async remove(paths) {
            calls.push({ type: 'storage-remove', bucket, paths });
            return { data: null, error: config.storageRemoveError || null };
          }
        };
      }
    },
    from(table) {
      return makeBuilder(table, calls, config);
    }
  };

  const sandbox = {
    console,
    crypto: {
      randomUUID() {
        return uuids[uuidCounter++] || '33333333-3333-4333-8333-333333333333';
      }
    },
    window: {
      ChronusEditorial: {},
      ChronusAuth: {
        getProfile: () => ({ role: config.role || 'narrator' }),
        getUser: () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      },
      ChronusSupabase: {
        getClient: () => client
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'editorial_v11.js' });
  return { api: sandbox.window.ChronusEditorial, calls };
}

(async () => {
  const metadata = {
    title: 'Manual CHRONUS',
    slug: 'manual-chronus',
    category: 'system_book',
    version: '1.0',
    description: 'Teste',
    page_count: 120,
    sort_order: 1
  };
  const pdf = { type: 'application/pdf', size: 1024, name: 'manual.pdf' };

  {
    const { api, calls } = harness();
    const result = await api.createLibraryItemWithFile(metadata, pdf);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.id, '11111111-1111-4111-8111-111111111111');
    assert.strictEqual(result.data.visibility, 'narrator');
    assert.strictEqual(result.data.published, false);
    assert.strictEqual(
      result.data.file_path,
      'library/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf'
    );

    const uploadIndex = calls.findIndex(c => c.type === 'storage-upload');
    const portalIndex = calls.findIndex(c => c.type === 'db-insert' && c.table === 'portal_assets');
    const parentIndex = calls.findIndex(c => c.type === 'db-insert' && c.table === 'library_items');
    assert.ok(uploadIndex >= 0);
    assert.ok(portalIndex > uploadIndex);
    assert.ok(parentIndex > portalIndex);
  }

  {
    const { api, calls } = harness();
    const result = await api.createLibraryItemWithFile(metadata, { type: 'image/png', size: 100 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_FILE_TYPE');
    assert.strictEqual(calls.length, 0);
  }

  {
    const { api, calls } = harness({ portalInsertError: { message: 'catalog failed' } });
    const result = await api.createLibraryItemWithFile(metadata, pdf);
    assert.strictEqual(result.ok, false);
    assert.ok(calls.some(c => c.type === 'storage-remove'));
    assert.ok(!calls.some(c => c.type === 'db-insert' && c.table === 'library_items'));
  }

  {
    const { api, calls } = harness({ parentInsertError: { message: 'parent failed' } });
    const result = await api.createLibraryItemWithFile(metadata, pdf);
    assert.strictEqual(result.ok, false);
    const removeStorageIndex = calls.findIndex(c => c.type === 'storage-remove');
    const deleteCatalogIndex = calls.findIndex(c => c.type === 'db-delete' && c.table === 'portal_assets');
    assert.ok(removeStorageIndex >= 0);
    assert.ok(deleteCatalogIndex > removeStorageIndex);
  }

  {
    const { api } = harness({ role: 'player' });
    const result = await api.createLibraryItemWithFile(metadata, pdf);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_NARRATOR');
  }

  console.log('PASS: CHRONUS v1.1 composite Library CREATE tests');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
