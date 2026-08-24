-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- PREFLIGHT AUDIT SCRIPT: 001_PORTAL_CONTENT (100% READ-ONLY)
-- ============================================================================
-- OBJETIVO:
-- Diagnosticar o estado do Supabase REAL antes de executar a migration 001.
-- Proibido: CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, TRUNCATE, GRANT, REVOKE.
-- Permitido: Apenas SELECT e consultas aos catálogos do PostgreSQL.
-- ============================================================================

-- ============================================================================
-- 1. INSPEÇÃO DA FUNÇÃO DO NARRADOR (public.is_chronus_narrator)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  l.lanname AS language,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility,
  p.proconfig AS search_path_config,
  r.rolname AS owner,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
JOIN pg_roles r ON p.proowner = r.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_chronus_narrator', 'is_narrator');

-- ============================================================================
-- 2. INSPEÇÃO DAS TABELAS LEGADAS (characters, profiles)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('characters', 'profiles')
  AND c.relkind = 'r';

-- ============================================================================
-- 3. INSPEÇÃO DAS POLICIES LEGADAS (characters, profiles, storage.objects)
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('characters', 'profiles'))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- ============================================================================
-- 4. INSPEÇÃO DO BUCKET LEGADO (portraits)
-- ============================================================================
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
FROM storage.buckets
WHERE id = 'portraits';

-- ============================================================================
-- 5. DETECTOR DE COLISÕES DE TABELAS NOVAS (Deve retornar 0 linhas)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  c.relname AS existing_table_name,
  c.relkind AS object_type
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'portal_assets',
    'chronicle_chapters', 'chapter_secrets',
    'campaign_sessions', 'session_secrets',
    'npcs', 'npc_secrets',
    'locations', 'location_secrets',
    'campaign_documents', 'document_secrets',
    'soundtrack', 'library_items',
    'session_npcs', 'session_locations', 'session_documents',
    'chapter_npcs', 'chapter_locations',
    'npc_locations', 'npc_documents'
  );

-- ============================================================================
-- 6. DETECTOR DE COLISÕES DE FUNÇÕES NOVAS (Deve retornar 0 linhas)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  p.proname AS existing_function_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_chronus_player_or_narrator',
    'can_read_portal_asset',
    'handle_chronus_updated_at'
  );

-- ============================================================================
-- 7. DETECTOR DE COLISÕES DE BUCKETS NOVOS (Deve retornar 0 linhas)
-- ============================================================================
SELECT
  id AS existing_bucket_id,
  name,
  public
FROM storage.buckets
WHERE id IN ('campaign-images', 'maps', 'documents', 'library');

-- ============================================================================
-- 8. DETECTOR DE COLISÕES DE POLICIES NOVAS (Deve retornar 0 linhas)
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname AS existing_policy_name
FROM pg_policies
WHERE policyname IN (
  'portal_assets_select_policy', 'portal_assets_admin_policy',
  'chronicle_chapters_select_policy', 'chronicle_chapters_admin_policy',
  'chapter_secrets_narrator_exclusive',
  'campaign_sessions_select_policy', 'campaign_sessions_admin_policy',
  'session_secrets_narrator_exclusive',
  'npcs_select_policy', 'npcs_admin_policy', 'npc_secrets_narrator_exclusive',
  'locations_select_policy', 'locations_admin_policy', 'location_secrets_narrator_exclusive',
  'campaign_documents_select_policy', 'campaign_documents_admin_policy', 'document_secrets_narrator_exclusive',
  'soundtrack_select_policy', 'soundtrack_admin_policy',
  'library_items_select_policy', 'library_items_admin_policy',
  'session_npcs_select_protected', 'session_npcs_admin',
  'session_locations_select_protected', 'session_locations_admin',
  'session_documents_select_protected', 'session_documents_admin',
  'chapter_npcs_select_protected', 'chapter_npcs_admin',
  'chapter_locations_select_protected', 'chapter_locations_admin',
  'npc_locations_select_protected', 'npc_locations_admin',
  'npc_documents_select_protected', 'npc_documents_admin',
  'campaign_storage_read_policy', 'campaign_storage_insert_policy',
  'campaign_storage_update_policy', 'campaign_storage_delete_policy'
);
