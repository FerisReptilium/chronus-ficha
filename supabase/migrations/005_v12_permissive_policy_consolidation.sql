-- ============================================================================
-- CHRONUS v1.2 — PERMISSIVE POLICY CONSOLIDATION
-- Incremental migration after 004_v12_rls_initplan_optimization.sql.
--
-- Goal:
--   Remove redundant SELECT evaluation caused by narrator admin policies
--   declared FOR ALL alongside dedicated SELECT policies that already preserve
--   narrator read access.
--
-- Strategy:
--   - Preserve every existing SELECT policy unchanged.
--   - Replace each narrator FOR ALL policy with narrator-only INSERT, UPDATE and
--     DELETE policies.
--   - Keep TO public and chronus_private.is_chronus_narrator() so write
--     authorization semantics remain identical to the pre-005 state.
--   - Do not change visibility, publication, role, helper, grant or table rules.
-- ============================================================================

BEGIN;

-- Preflight: production/local schema must match the exact audited pattern.
DO $$
DECLARE
  r record;
  v_count integer;
  v_select_count integer;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('campaign_documents', 'campaign_documents_admin_policy'),
      ('campaign_sessions',  'campaign_sessions_admin_policy'),
      ('chapter_locations',   'chapter_locations_admin'),
      ('chapter_npcs',        'chapter_npcs_admin'),
      ('chronicle_chapters',  'chronicle_chapters_admin_policy'),
      ('library_items',       'library_items_admin_policy'),
      ('locations',           'locations_admin_policy'),
      ('npc_documents',       'npc_documents_admin'),
      ('npc_locations',       'npc_locations_admin'),
      ('npcs',                'npcs_admin_policy'),
      ('portal_assets',       'portal_assets_admin_policy'),
      ('session_documents',   'session_documents_admin'),
      ('session_locations',   'session_locations_admin'),
      ('session_npcs',        'session_npcs_admin'),
      ('soundtrack',          'soundtrack_admin_policy')
    ) AS target(tablename, admin_policy)
  LOOP
    IF to_regclass(format('public.%I', r.tablename)) IS NULL THEN
      RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy preflight failed: public.% missing', r.tablename;
    END IF;

    SELECT count(*)
      INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = r.tablename
       AND policyname = r.admin_policy
       AND permissive = 'PERMISSIVE'
       AND roles = ARRAY['public']::name[]
       AND cmd = 'ALL'
       AND qual = 'chronus_private.is_chronus_narrator()'
       AND with_check = 'chronus_private.is_chronus_narrator()';

    IF v_count <> 1 THEN
      RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy preflight failed: expected audited FOR ALL narrator policy %.% exactly once', r.tablename, r.admin_policy;
    END IF;

    -- Each target must already have one dedicated SELECT policy. Migration 005
    -- never rewrites it; this guard prevents accidentally removing narrator read
    -- access from a schema that drifted away from the audited baseline.
    SELECT count(*)
      INTO v_select_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = r.tablename
       AND cmd = 'SELECT';

    IF v_select_count <> 1 THEN
      RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy preflight failed: expected exactly one dedicated SELECT policy on public.%, found %', r.tablename, v_select_count;
    END IF;
  END LOOP;
END
$$;

-- Replace only the redundant FOR ALL narrator policies. The dedicated SELECT
-- policies are deliberately left untouched.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('campaign_documents', 'campaign_documents_admin_policy'),
      ('campaign_sessions',  'campaign_sessions_admin_policy'),
      ('chapter_locations',   'chapter_locations_admin'),
      ('chapter_npcs',        'chapter_npcs_admin'),
      ('chronicle_chapters',  'chronicle_chapters_admin_policy'),
      ('library_items',       'library_items_admin_policy'),
      ('locations',           'locations_admin_policy'),
      ('npc_documents',       'npc_documents_admin'),
      ('npc_locations',       'npc_locations_admin'),
      ('npcs',                'npcs_admin_policy'),
      ('portal_assets',       'portal_assets_admin_policy'),
      ('session_documents',   'session_documents_admin'),
      ('session_locations',   'session_locations_admin'),
      ('session_npcs',        'session_npcs_admin'),
      ('soundtrack',          'soundtrack_admin_policy')
    ) AS target(tablename, admin_policy)
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.admin_policy, r.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (chronus_private.is_chronus_narrator())',
      r.tablename || '_admin_insert',
      r.tablename
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (chronus_private.is_chronus_narrator()) WITH CHECK (chronus_private.is_chronus_narrator())',
      r.tablename || '_admin_update',
      r.tablename
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO public USING (chronus_private.is_chronus_narrator())',
      r.tablename || '_admin_delete',
      r.tablename
    );
  END LOOP;
END
$$;

-- Postcondition: exactly one SELECT policy remains per target, no FOR ALL policy
-- remains, and all 45 narrator write policies have the audited shape.
DO $$
DECLARE
  r record;
  v_count integer;
  v_write_count integer := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('campaign_documents'),
      ('campaign_sessions'),
      ('chapter_locations'),
      ('chapter_npcs'),
      ('chronicle_chapters'),
      ('library_items'),
      ('locations'),
      ('npc_documents'),
      ('npc_locations'),
      ('npcs'),
      ('portal_assets'),
      ('session_documents'),
      ('session_locations'),
      ('session_npcs'),
      ('soundtrack')
    ) AS target(tablename)
  LOOP
    SELECT count(*)
      INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = r.tablename
       AND cmd = 'ALL';
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy assertion failed: FOR ALL policy remains on public.%', r.tablename;
    END IF;

    SELECT count(*)
      INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = r.tablename
       AND cmd = 'SELECT';
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy assertion failed: expected one SELECT policy on public.%, found %', r.tablename, v_count;
    END IF;

    SELECT count(*)
      INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = r.tablename
       AND policyname IN (
         r.tablename || '_admin_insert',
         r.tablename || '_admin_update',
         r.tablename || '_admin_delete'
       )
       AND permissive = 'PERMISSIVE'
       AND roles = ARRAY['public']::name[]
       AND (
         (cmd = 'INSERT' AND qual IS NULL AND with_check = 'chronus_private.is_chronus_narrator()')
         OR
         (cmd = 'UPDATE' AND qual = 'chronus_private.is_chronus_narrator()' AND with_check = 'chronus_private.is_chronus_narrator()')
         OR
         (cmd = 'DELETE' AND qual = 'chronus_private.is_chronus_narrator()' AND with_check IS NULL)
       );

    IF v_count <> 3 THEN
      RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy assertion failed: expected three narrator write policies on public.%, found %', r.tablename, v_count;
    END IF;

    v_write_count := v_write_count + v_count;
  END LOOP;

  IF v_write_count <> 45 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 permissive-policy assertion failed: expected 45 narrator write policies, found %', v_write_count;
  END IF;
END
$$;

COMMIT;
