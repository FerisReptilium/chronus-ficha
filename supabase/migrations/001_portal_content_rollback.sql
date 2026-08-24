-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- ROLLBACK 001: DESFAZER ARQUITETURA DE CONTEÚDO EDITORIAL (v2.0)
-- ============================================================================
-- IMPORTANTE:
-- Remove EXCLUSIVAMENTE os objetos adicionados na migração 001.
-- NUNCA toca em characters, profiles, auth.users, bucket portraits ou funções legadas.
-- ============================================================================

-- 1. Remover Policies de Storage dos 4 novos buckets
DROP POLICY IF EXISTS "campaign_storage_read_policy" ON storage.objects;
DROP POLICY IF EXISTS "campaign_storage_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "campaign_storage_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "campaign_storage_delete_policy" ON storage.objects;

-- 2. Remover Buckets criados na migração 001
DELETE FROM storage.buckets WHERE id IN ('campaign-images', 'maps', 'documents', 'library');

-- 3. Remover Junction Tables
DROP TABLE IF EXISTS public.npc_documents CASCADE;
DROP TABLE IF EXISTS public.npc_locations CASCADE;
DROP TABLE IF EXISTS public.chapter_locations CASCADE;
DROP TABLE IF EXISTS public.chapter_npcs CASCADE;
DROP TABLE IF EXISTS public.session_documents CASCADE;
DROP TABLE IF EXISTS public.session_locations CASCADE;
DROP TABLE IF EXISTS public.session_npcs CASCADE;

-- 4. Remover Tabelas de Segredos do Narrador
DROP TABLE IF EXISTS public.document_secrets CASCADE;
DROP TABLE IF EXISTS public.location_secrets CASCADE;
DROP TABLE IF EXISTS public.npc_secrets CASCADE;

-- 5. Remover Tabelas Editoriais Principais
DROP TABLE IF EXISTS public.library_items CASCADE;
DROP TABLE IF EXISTS public.soundtrack CASCADE;
DROP TABLE IF EXISTS public.campaign_documents CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.npcs CASCADE;
DROP TABLE IF EXISTS public.campaign_sessions CASCADE;
DROP TABLE IF EXISTS public.chronicle_chapters CASCADE;

-- 6. Remover Trigger Function criada na migração 001
DROP FUNCTION IF EXISTS public.handle_chronus_updated_at();

-- Preservar is_chronus_narrator() e is_chronus_player_or_narrator() caso reutilizadas
