-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- MIGRATION 000: CORE AUTH, PROFILES, CHARACTERS & PORTRAITS
-- ============================================================================
-- This is the baseline for a NEW, EMPTY CHRONUS Supabase project.
--
-- It establishes the core objects required by:
--   * js/services/auth.js        -> auth.users + public.profiles
--   * js/modules/sheet_engine.js -> public.characters + storage.portraits
--   * js/modules/narrator_panel.js -> narrator visibility of player profiles
--
-- IMPORTANT:
--   1. Supabase owns auth.users and Storage's storage.* tables. Do not recreate
--      either managed schema.
--   2. This migration intentionally refuses to run when legacy core tables or
--      the portraits bucket already exist. Inspect and migrate legacy projects
--      separately; never overwrite their data by applying this baseline.
--   3. Auth users are provisioned through Supabase Auth. Their profiles are
--      created automatically. Passwords are never stored in public tables.
--   4. New accounts default to role 'player'. Promote the Narrator from a
--      trusted SQL/admin session only; never let a client change its own role.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. SAFETY PREFLIGHT — BASELINE IS FOR A CLEAN PROJECT ONLY
-- ----------------------------------------------------------------------------

DO $preflight$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     OR to_regclass('public.characters') IS NOT NULL THEN
    RAISE EXCEPTION
      'CHRONUS core baseline refused: public.profiles or public.characters already exists. Inspect and migrate the existing schema; do not overwrite it.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'portraits'
  ) THEN
    RAISE EXCEPTION
      'CHRONUS core baseline refused: Storage bucket portraits already exists. Inspect its files and policies before proceeding.';
  END IF;
END;
$preflight$;

-- ----------------------------------------------------------------------------
-- 1. CORE IDENTITY TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_check
    CHECK (role IN ('player', 'narrator'))
);

CREATE INDEX profiles_role_display_name_idx
  ON public.profiles (role, display_name);

COMMENT ON TABLE public.profiles IS
  'CHRONUS profile linked 1:1 to Supabase Auth. Role is controlled by trusted administrators.';
COMMENT ON COLUMN public.profiles.role IS
  'Authorization role: player or narrator. This column must never be client-editable.';

-- ----------------------------------------------------------------------------
-- 2. CHARACTER SHEETS
-- ----------------------------------------------------------------------------

CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Novo personagem',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The application loads the most recently updated character for each player.
-- Keep the model one-to-many so prior/alternate character records are not lost.
CREATE INDEX characters_user_updated_at_idx
  ON public.characters (user_id, updated_at DESC);

COMMENT ON TABLE public.characters IS
  'CHRONUS character sheets. The full v0.6.1 sheet state is stored in JSONB data.';
COMMENT ON COLUMN public.characters.data IS
  'Serialized CHRONUS digital sheet state; written by the authenticated owner.';

-- ----------------------------------------------------------------------------
-- 3. SHARED UPDATED_AT TRIGGER
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_core_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_core_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_core_updated_at();

CREATE TRIGGER characters_set_updated_at
  BEFORE UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_core_updated_at();

-- ----------------------------------------------------------------------------
-- 4. NARRATOR AUTHORIZATION HELPER
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER avoids recursive RLS when policies need to inspect the
-- current user's own role in public.profiles.

CREATE OR REPLACE FUNCTION public.is_chronus_narrator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'narrator'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_chronus_narrator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chronus_narrator()
  TO anon, authenticated, service_role;

-- Compatibility helper expected by the existing v1.1 security-hardening
-- migration. It is intentionally not attached to an event trigger.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. SUPABASE AUTH -> PROFILE AUTOMATION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_chronus_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_display_name TEXT;
BEGIN
  v_display_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'Desperto'
  );

  INSERT INTO public.profiles (id, display_name, email, role)
  VALUES (NEW.id, v_display_name, NEW.email, 'player')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(profiles.display_name, EXCLUDED.display_name),
        updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_chronus_user_email_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email,
      updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

-- Trigger-only functions are not part of the public RPC surface.
REVOKE ALL ON FUNCTION public.handle_new_chronus_user()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_chronus_user_email_update()
  FROM PUBLIC, anon, authenticated, service_role;

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND NOT tgisinternal
  ) THEN
    EXECUTE $sql$
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_chronus_user()
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_email_updated'
      AND NOT tgisinternal
  ) THEN
    EXECUTE $sql$
      CREATE TRIGGER on_auth_user_email_updated
      AFTER UPDATE OF email ON auth.users
      FOR EACH ROW
      WHEN (OLD.email IS DISTINCT FROM NEW.email)
      EXECUTE FUNCTION public.handle_chronus_user_email_update()
    $sql$;
  END IF;
END;
$triggers$;

-- Backfill profiles for Auth users that predate this migration. Existing
-- display names and roles are preserved; only missing names and email sync.
INSERT INTO public.profiles (id, display_name, email, role)
SELECT
  u.id,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(u.email, ''), '@', 1), ''),
    'Desperto'
  ),
  u.email,
  'player'
FROM auth.users AS u
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name),
      updated_at = now();

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY — PROFILES & CHARACTERS
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- A player can read their own profile. The Narrator can read the roster.
CREATE POLICY profiles_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (SELECT public.is_chronus_narrator())
  );

-- Players can only read their own sheets; the Narrator has read-only access
-- to all sheets for the narrator dashboard.
CREATE POLICY characters_select_own_or_narrator
  ON public.characters
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.is_chronus_narrator())
  );

CREATE POLICY characters_insert_own
  ON public.characters
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY characters_update_own
  ON public.characters
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY characters_delete_own
  ON public.characters
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Supabase projects may have broad default privileges on public tables.
-- Explicitly revoke them: clients may read profiles but must never create,
-- edit, delete, truncate, or reassign roles. The Auth trigger writes via its
-- SECURITY DEFINER owner context; administrators operate as trusted DB roles.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. PRIVATE PORTRAIT STORAGE
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'portraits',
  'portraits',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- User may read their portrait; the Narrator may inspect player portraits.
CREATE POLICY portraits_select_owner_or_narrator
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'portraits'
    AND (
      split_part(name, '/', 1) = (SELECT auth.uid())::text
      OR (SELECT public.is_chronus_narrator())
    )
  );

CREATE POLICY portraits_insert_owner
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portraits'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );

-- Storage upsert requires SELECT, INSERT and UPDATE policies for the same path.
CREATE POLICY portraits_update_owner
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portraits'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'portraits'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );

CREATE POLICY portraits_delete_owner
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portraits'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );

COMMIT;
