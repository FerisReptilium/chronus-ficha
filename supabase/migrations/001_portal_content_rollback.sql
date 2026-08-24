-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- ROLLBACK 001: DESFAZER ARQUITETURA DE CONTEÚDO EDITORIAL
-- ============================================================================
-- IMPORTANTE:
-- Remove exclusivamente os objetos adicionados na migração 001.
-- NÃO toca em characters, profiles, auth.users ou bucket portraits.
-- ============================================================================

-- 1. Remover Policies de Storage
DROP POLICY IF EXISTS "Public Read for campaign-images" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Upload for campaign-images" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Update for campaign-images" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Delete for campaign-images" ON storage.objects;

DROP POLICY IF EXISTS "Public Read for maps" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Upload for maps" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Update for maps" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Delete for maps" ON storage.objects;

DROP POLICY IF EXISTS "Public Read for documents" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Upload for documents" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Update for documents" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Delete for documents" ON storage.objects;

DROP POLICY IF EXISTS "Public Read for library" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Upload for library" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Update for library" ON storage.objects;
DROP POLICY IF EXISTS "Narrator Delete for library" ON storage.objects;

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

-- 5. Remover Tabelas Editoriais
DROP TABLE IF EXISTS public.library_items CASCADE;
DROP TABLE IF EXISTS public.soundtrack CASCADE;
DROP TABLE IF EXISTS public.campaign_documents CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.npcs CASCADE;
DROP TABLE IF EXISTS public.campaign_sessions CASCADE;
DROP TABLE IF EXISTS public.chronicle_chapters CASCADE;

-- 6. Remover Funções Auxiliares (se não forem usadas em policies legadas)
-- NOTA: DROP FUNCTION is_narrator() e is_player_or_narrator() só se não houver dependências
DROP FUNCTION IF EXISTS public.is_player_or_narrator();
-- Preservar is_narrator caso já estivesse presente anteriormente
