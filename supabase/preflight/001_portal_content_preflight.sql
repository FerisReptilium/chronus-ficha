-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- PREFLIGHT AUDIT SCRIPT: 001_PORTAL_CONTENT (100% READ-ONLY)
-- ============================================================================
-- OBJETIVO:
-- Diagnosticar o estado do Supabase ANTES de executar a migration 001.
-- NÃO altera, NÃO cria e NÃO remove nenhum objeto no banco.
-- ============================================================================

-- 1. Inspecionar Função Existente do Narrador (public.is_chronus_narrator)
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility,
  proconfig AS search_path_config,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname IN ('is_chronus_narrator', 'is_narrator');

-- 2. Inspecionar Tabelas Críticas Existentes e Status de RLS
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  hasindexes
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('characters', 'profiles');

-- 3. Inspecionar Bucket Privado Legado (portraits) e Demais Buckets
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets;

-- 4. Inspecionar Policies Atuais do Schema Storage
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage';

-- 5. Detector de Conflitos Prévios de Nomes (Tabelas a serem criadas)
SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
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

-- 6. Detector de Conflitos de Funções a serem criadas
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_chronus_player_or_narrator', 'can_read_portal_asset', 'handle_chronus_updated_at');
