const fs = require('fs');
const assert = require('assert');

const sql = fs.readFileSync('supabase/migrations/003_v12_rls_helper_hardening.sql', 'utf8');

function has(re, message) {
  assert(re.test(sql), message);
}

has(/BEGIN\s*;/i, 'migration must begin transaction');
has(/COMMIT\s*;/i, 'migration must commit transaction');
has(/CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+chronus_private/i, 'private schema must be created');
has(/REVOKE\s+ALL\s+ON\s+SCHEMA\s+chronus_private\s+FROM\s+PUBLIC/i, 'PUBLIC schema access must be revoked');
has(/ALTER\s+FUNCTION\s+public\.is_chronus_narrator\(\)\s+SET\s+SCHEMA\s+chronus_private/i, 'narrator helper must leave public schema');
has(/ALTER\s+FUNCTION\s+public\.is_chronus_player_or_narrator\(\)\s+SET\s+SCHEMA\s+chronus_private/i, 'player/narrator helper must leave public schema');
has(/ALTER\s+FUNCTION\s+public\.can_read_portal_asset\(text,\s*text\)\s+SET\s+SCHEMA\s+chronus_private/i, 'asset helper must leave public schema');
has(/SECURITY\s+DEFINER/ig, 'helpers must remain SECURITY DEFINER');
has(/SET\s+search_path\s*=\s*''/ig, 'helpers must keep empty search_path');
has(/chronus_private\.is_chronus_narrator\(\)/i, 'internal narrator helper calls must be schema-qualified');
has(/chronus_private\.is_chronus_player_or_narrator\(\)/i, 'internal player/narrator helper calls must be schema-qualified');
has(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+chronus_private\.is_chronus_narrator\(\)\s+TO\s+anon,\s*authenticated,\s*service_role/i, 'policy evaluation roles must retain narrator helper EXECUTE');
has(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+chronus_private\.can_read_portal_asset\(text,\s*text\)\s+TO\s+anon,\s*authenticated,\s*service_role/i, 'policy evaluation roles must retain asset helper EXECUTE');
has(/to_regprocedure\('public\.is_chronus_narrator\(\)'\)/i, 'migration must preflight narrator helper');
has(/authorization helpers still exist in public/i, 'migration must assert public helper removal');
has(/expected 3 private authorization helpers/i, 'migration must assert all helpers moved');

assert(!/DROP\s+POLICY/i.test(sql), 'first hardening block must not drop/recreate policies');
assert(!/DROP\s+FUNCTION/i.test(sql), 'first hardening block must preserve helper OIDs');
assert(!/DELETE\s+FROM\s+storage\.objects/i.test(sql), 'migration must not manipulate storage objects');

console.log('PASS: v1.2 RLS helper hardening migration structure');
