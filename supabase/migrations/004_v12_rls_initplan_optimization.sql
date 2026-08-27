-- ============================================================================
-- CHRONUS v1.2 — RLS INITPLAN OPTIMIZATION
-- Incremental migration for the existing v1.2 backend after migration 003.
--
-- Goal:
--   Resolve Supabase `auth_rls_initplan` warnings by evaluating auth.uid() once
--   per statement through a scalar subquery instead of once per row.
--
-- Scope:
--   - public.characters: INSERT / UPDATE / DELETE / SELECT ownership checks.
--   - public.profiles: SELECT own-profile check.
--
-- Security semantics are intentionally unchanged. Narrator access continues to
-- use chronus_private.is_chronus_narrator(). No role, visibility or write rule
-- is broadened by this migration.
-- ============================================================================

BEGIN;

-- Fail fast on schema/policy drift. This keeps the migration small and makes it
-- unsafe to apply accidentally to a database that does not match the expected
-- v1.2 baseline.
DO $$
DECLARE
  v_policy_count integer;
BEGIN
  IF to_regclass('public.characters') IS NULL THEN
    RAISE EXCEPTION 'CHRONUS v1.2 initplan preflight failed: public.characters missing';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'CHRONUS v1.2 initplan preflight failed: public.profiles missing';
  END IF;

  SELECT count(*)
    INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (
       (tablename = 'characters' AND policyname IN (
         'characters_insert_own',
         'characters_update_own',
         'characters_delete_own',
         'characters_select_own_or_narrator'
       ))
       OR
       (tablename = 'profiles' AND policyname = 'profiles_select')
     );

  IF v_policy_count <> 5 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 initplan preflight failed: expected 5 target policies, found %', v_policy_count;
  END IF;
END
$$;

ALTER POLICY characters_insert_own
  ON public.characters
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY characters_update_own
  ON public.characters
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY characters_delete_own
  ON public.characters
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY characters_select_own_or_narrator
  ON public.characters
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR chronus_private.is_chronus_narrator()
  );

ALTER POLICY profiles_select
  ON public.profiles
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR chronus_private.is_chronus_narrator()
  );

-- Structural verification: all five target policies still exist, are scoped to
-- authenticated, and the deparsed policy expressions now contain SELECT
-- auth.uid() rather than a direct per-row auth.uid() call.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*)
    INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (
       (tablename = 'characters' AND policyname IN (
         'characters_insert_own',
         'characters_update_own',
         'characters_delete_own',
         'characters_select_own_or_narrator'
       ))
       OR
       (tablename = 'profiles' AND policyname = 'profiles_select')
     )
     AND (
       roles <> ARRAY['authenticated']::name[]
       OR (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~* 'select[[:space:]]+auth\.uid\(\)'
     );

  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 initplan assertion failed: % target policies not optimized as expected', v_bad;
  END IF;
END
$$;

COMMIT;
