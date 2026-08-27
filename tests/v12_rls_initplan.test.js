const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '004_v12_rls_initplan_optimization.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(/BEGIN;/i.test(sql) && /COMMIT;/i.test(sql), 'migration must be transactional');
assert(/ALTER POLICY characters_insert_own/i.test(sql), 'missing insert policy optimization');
assert(/ALTER POLICY characters_update_own/i.test(sql), 'missing update policy optimization');
assert(/ALTER POLICY characters_delete_own/i.test(sql), 'missing delete policy optimization');
assert(/ALTER POLICY characters_select_own_or_narrator/i.test(sql), 'missing character select policy optimization');
assert(/ALTER POLICY profiles_select/i.test(sql), 'missing profiles select policy optimization');

const selectUidMatches = sql.match(/\(SELECT auth\.uid\(\)\)/g) || [];
assert(selectUidMatches.length >= 6, 'expected scalar SELECT auth.uid() in all ownership checks');

assert(/chronus_private\.is_chronus_narrator\(\)/.test(sql), 'narrator helper semantics must be preserved');
assert(!/DROP\s+POLICY/i.test(sql), 'must not drop policies');
assert(!/DROP\s+FUNCTION/i.test(sql), 'must not drop functions');
assert(!/ALTER\s+TABLE\s+public\.(characters|profiles)\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql), 'must not disable RLS');
assert(!/GRANT\s+ALL/i.test(sql), 'must not broaden privileges');

console.log('PASS: v1.2 auth RLS initplan optimization migration is structurally safe');
