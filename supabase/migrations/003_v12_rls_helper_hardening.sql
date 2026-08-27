-- ============================================================================
-- CHRONUS v1.2 — RLS HELPER HARDENING
-- Incremental migration. Intended for the existing v1.1.0 production schema.
--
-- Goal:
--   Remove SECURITY DEFINER authorization helpers from the exposed `public`
--   RPC surface without changing the authorization semantics of existing RLS
--   and Storage policies.
--
-- Strategy:
--   1. Move the three policy helpers to a non-public schema.
--   2. Preserve EXECUTE for the database roles that evaluate the policies.
--   3. Keep search_path pinned to '' and all table/function references explicit.
--   4. Do not rewrite/drop RLS policies in this migration; PostgreSQL dependency
--      tracking keeps policy references bound to the same function OIDs when a
--      function is moved with ALTER FUNCTION ... SET SCHEMA.
--
-- IMPORTANT:
--   This file is committed to editorial-v1.2 only. It must be homologated in a
--   disposable/test environment before being applied to production.
-- ============================================================================

BEGIN;

-- Fail fast if the expected v1.1 authorization surface is not present.
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regprocedure('public.is_chronus_narrator()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_chronus_narrator()');
  END IF;

  IF to_regprocedure('public.is_chronus_player_or_narrator()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_chronus_player_or_narrator()');
  END IF;

  IF to_regprocedure('public.can_read_portal_asset(text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.can_read_portal_asset(text,text)');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 preflight failed; missing functions: %', array_to_string(v_missing, ', ');
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS chronus_private;
COMMENT ON SCHEMA chronus_private IS
  'Internal CHRONUS authorization helpers used by RLS/Storage policies; not an application RPC surface.';

REVOKE ALL ON SCHEMA chronus_private FROM PUBLIC;
GRANT USAGE ON SCHEMA chronus_private TO anon, authenticated, service_role;

-- Moving functions preserves their OIDs, so existing policy dependencies remain
-- attached to the same objects without a policy drop/recreate cycle.
ALTER FUNCTION public.is_chronus_narrator()
  SET SCHEMA chronus_private;

ALTER FUNCTION public.is_chronus_player_or_narrator()
  SET SCHEMA chronus_private;

ALTER FUNCTION public.can_read_portal_asset(text, text)
  SET SCHEMA chronus_private;

-- Keep helper implementations hardened and fully-qualified after the schema move.
CREATE OR REPLACE FUNCTION chronus_private.is_chronus_narrator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'narrator'
  );
$$;

CREATE OR REPLACE FUNCTION chronus_private.is_chronus_player_or_narrator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('player', 'narrator')
  );
$$;

CREATE OR REPLACE FUNCTION chronus_private.can_read_portal_asset(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset RECORD;
  v_parent_valid boolean := false;
  v_is_narrator boolean;
  v_is_player_or_narrator boolean;
BEGIN
  SELECT chronus_private.is_chronus_narrator()
    INTO v_is_narrator;

  IF v_is_narrator THEN
    RETURN true;
  END IF;

  SELECT *
    INTO v_asset
    FROM public.portal_assets
   WHERE bucket_id = p_bucket_id
     AND object_path = p_object_path;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT chronus_private.is_chronus_player_or_narrator()
    INTO v_is_player_or_narrator;

  IF v_asset.content_type IS NOT NULL AND v_asset.content_id IS NOT NULL THEN
    IF v_asset.content_type = 'chapter' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.chronicle_chapters
         WHERE id = v_asset.content_id
           AND published = true
           AND (published_at IS NULL OR published_at <= now())
           AND (
             visibility = 'public'
             OR (visibility = 'players' AND v_is_player_or_narrator)
           )
      ) INTO v_parent_valid;

    ELSIF v_asset.content_type = 'session' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.campaign_sessions
         WHERE id = v_asset.content_id
           AND published = true
           AND (published_at IS NULL OR published_at <= now())
           AND (
             visibility = 'public'
             OR (visibility = 'players' AND v_is_player_or_narrator)
           )
      ) INTO v_parent_valid;

    ELSIF v_asset.content_type = 'npc' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.npcs
         WHERE id = v_asset.content_id
           AND published = true
           AND (published_at IS NULL OR published_at <= now())
           AND (
             visibility = 'public'
             OR (visibility = 'players' AND v_is_player_or_narrator)
           )
      ) INTO v_parent_valid;

    ELSIF v_asset.content_type = 'location' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.locations
         WHERE id = v_asset.content_id
           AND published = true
           AND (published_at IS NULL OR published_at <= now())
           AND (
             visibility = 'public'
             OR (visibility = 'players' AND v_is_player_or_narrator)
           )
      ) INTO v_parent_valid;

    ELSIF v_asset.content_type = 'document' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.campaign_documents
         WHERE id = v_asset.content_id
           AND published = true
           AND (published_at IS NULL OR published_at <= now())
           AND (
             visibility = 'public'
             OR (visibility = 'players' AND v_is_player_or_narrator)
           )
      ) INTO v_parent_valid;

    ELSIF v_asset.content_type = 'library' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.library_items
         WHERE id = v_asset.content_id
           AND published = true
           AND (published_at IS NULL OR published_at <= now())
           AND (
             visibility = 'public'
             OR (visibility = 'players' AND v_is_player_or_narrator)
           )
      ) INTO v_parent_valid;

    ELSE
      RETURN false;
    END IF;

    IF NOT v_parent_valid THEN
      RETURN false;
    END IF;
  END IF;

  IF v_asset.published = true
     AND (v_asset.published_at IS NULL OR v_asset.published_at <= now()) THEN
    IF v_asset.visibility = 'public' THEN
      RETURN true;
    ELSIF v_asset.visibility = 'players' AND v_is_player_or_narrator THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Explicit ACLs. The roles need EXECUTE because RLS/Storage policy evaluation
-- runs in the caller's role; schema placement, not broken policy permissions, is
-- what removes these helpers from the normal public RPC surface.
REVOKE ALL ON FUNCTION chronus_private.is_chronus_narrator() FROM PUBLIC;
REVOKE ALL ON FUNCTION chronus_private.is_chronus_player_or_narrator() FROM PUBLIC;
REVOKE ALL ON FUNCTION chronus_private.can_read_portal_asset(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION chronus_private.is_chronus_narrator()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION chronus_private.is_chronus_player_or_narrator()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION chronus_private.can_read_portal_asset(text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION chronus_private.is_chronus_narrator() IS
  'Internal RLS helper: true only for the authenticated CHRONUS narrator profile.';
COMMENT ON FUNCTION chronus_private.is_chronus_player_or_narrator() IS
  'Internal RLS helper: true for authenticated CHRONUS player or narrator profiles.';
COMMENT ON FUNCTION chronus_private.can_read_portal_asset(text, text) IS
  'Internal Storage/RLS helper enforcing asset publication, visibility and parent-content access.';

-- Post-move structural assertions. These deliberately validate shape, not data.
DO $$
DECLARE
  v_public_count integer;
  v_private_count integer;
  v_non_definer_count integer;
  v_bad_search_path_count integer;
BEGIN
  SELECT count(*)
    INTO v_public_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'is_chronus_narrator',
       'is_chronus_player_or_narrator',
       'can_read_portal_asset'
     );

  IF v_public_count <> 0 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 assertion failed: authorization helpers still exist in public';
  END IF;

  SELECT count(*)
    INTO v_private_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'chronus_private'
     AND p.proname IN (
       'is_chronus_narrator',
       'is_chronus_player_or_narrator',
       'can_read_portal_asset'
     );

  IF v_private_count <> 3 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 assertion failed: expected 3 private authorization helpers, found %', v_private_count;
  END IF;

  SELECT count(*)
    INTO v_non_definer_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'chronus_private'
     AND p.proname IN (
       'is_chronus_narrator',
       'is_chronus_player_or_narrator',
       'can_read_portal_asset'
     )
     AND NOT p.prosecdef;

  IF v_non_definer_count <> 0 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 assertion failed: helper lost SECURITY DEFINER';
  END IF;

  SELECT count(*)
    INTO v_bad_search_path_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'chronus_private'
     AND p.proname IN (
       'is_chronus_narrator',
       'is_chronus_player_or_narrator',
       'can_read_portal_asset'
     )
     AND NOT (coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=']::text[]);

  IF v_bad_search_path_count <> 0 THEN
    RAISE EXCEPTION 'CHRONUS v1.2 assertion failed: helper search_path is not pinned to empty';
  END IF;
END
$$;

COMMIT;
