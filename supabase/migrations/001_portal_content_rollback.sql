-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- ROLLBACK 001: DESFAZER ARQUITETURA DE CONTEÚDO EDITORIAL (v4.0)
-- ============================================================================
-- DIRETRIZES DE SEGURANÇA NO ROLLBACK:
-- 1. NUNCA executa DELETE massivo em storage.objects para evitar perda de dados.
-- 2. Preserva buckets se contiverem arquivos.
-- 3. Remove exclusivamente as policies, tabelas, junction tables e portal_assets criados na migração 001.
-- 4. NUNCA toca em characters, profiles, auth.users, bucket portraits ou funções legadas.
-- ============================================================================

-- 1. Remover Policies de Storage dos 4 buckets da campanha
DROP POLICY IF EXISTS "campaign_storage_read_policy" ON storage.objects;
DROP POLICY IF EXISTS "campaign_storage_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "campaign_storage_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "campaign_storage_delete_policy" ON storage.objects;

-- 2. Desmontar Buckets apenas se estiverem vazios (preservação de dados)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'campaign-images') THEN
    DELETE FROM storage.buckets WHERE id = 'campaign-images';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'maps') THEN
    DELETE FROM storage.buckets WHERE id = 'maps';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'documents') THEN
    DELETE FROM storage.buckets WHERE id = 'documents';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'library') THEN
    DELETE FROM storage.buckets WHERE id = 'library';
  END IF;
END $$;

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
DROP TABLE IF EXISTS public.session_secrets CASCADE;
DROP TABLE IF EXISTS public.chapter_secrets CASCADE;

-- 5. Remover Tabelas Editoriais Principais e Assets
DROP TABLE IF EXISTS public.portal_assets CASCADE;
DROP TABLE IF EXISTS public.library_items CASCADE;
DROP TABLE IF EXISTS public.soundtrack CASCADE;
DROP TABLE IF EXISTS public.campaign_documents CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.npcs CASCADE;
DROP TABLE IF EXISTS public.campaign_sessions CASCADE;
DROP TABLE IF EXISTS public.chronicle_chapters CASCADE;

-- 6. Remover Funções Auxiliares criadas exclusivamente na migração 001
DROP FUNCTION IF EXISTS public.can_read_portal_asset(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.handle_chronus_updated_at();
DROP FUNCTION IF EXISTS public.is_chronus_player_or_narrator();

-- NOTA: public.is_chronus_narrator() NÃO É REMOVIDA (preserva integridade do sistema legado).
