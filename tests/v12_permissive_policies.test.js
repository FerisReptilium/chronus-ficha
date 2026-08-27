const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '005_v12_permissive_policy_consolidation.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const targets = [
  'campaign_documents',
  'campaign_sessions',
  'chapter_locations',
  'chapter_npcs',
  'chronicle_chapters',
  'library_items',
  'locations',
  'npc_documents',
  'npc_locations',
  'npcs',
  'portal_assets',
  'session_documents',
  'session_locations',
  'session_npcs',
  'soundtrack',
];

assert(/BEGIN;/i.test(sql) && /COMMIT;/i.test(sql), 'migration must be transactional');
assert(/expected audited FOR ALL narrator policy/i.test(sql), 'missing preflight drift guard');
assert(/expected exactly one dedicated SELECT policy/i.test(sql), 'missing SELECT preservation guard');
assert(/expected 45 narrator write policies/i.test(sql), 'missing final 45-policy assertion');

for (const table of targets) {
  assert(sql.includes(`('${table}'`), `missing target ${table}`);
}

assert(/FOR INSERT TO public WITH CHECK \(chronus_private\.is_chronus_narrator\(\)\)/i.test(sql), 'missing narrator insert policy shape');
assert(/FOR UPDATE TO public USING \(chronus_private\.is_chronus_narrator\(\)\) WITH CHECK \(chronus_private\.is_chronus_narrator\(\)\)/i.test(sql), 'missing narrator update policy shape');
assert(/FOR DELETE TO public USING \(chronus_private\.is_chronus_narrator\(\)\)/i.test(sql), 'missing narrator delete policy shape');

assert(!/ALTER\s+TABLE\s+public\.[a-z_]+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql), 'must not disable RLS');
assert(!/GRANT\s+ALL/i.test(sql), 'must not broaden grants');
assert(!/DROP\s+FUNCTION/i.test(sql), 'must not drop helper functions');
assert(!/ALTER\s+POLICY\s+.*select/i.test(sql), 'dedicated SELECT policies must remain untouched');

console.log('PASS: v1.2 permissive policy consolidation migration is structurally safe');
