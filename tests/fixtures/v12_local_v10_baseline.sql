-- CHRONUS v1.2 local-only baseline fixture.
-- This file is never applied to production. It recreates only the pre-editorial
-- objects required to rehearse migrations 001/002/003/004 in disposable CI.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','narrator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Novo personagem',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chronus_narrator()
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

REVOKE ALL ON FUNCTION public.is_chronus_narrator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chronus_narrator() TO anon, authenticated, service_role;

-- Legacy v1.0 policies intentionally use direct auth.uid(). Migration 004 must
-- optimize only their evaluation strategy while preserving these semantics.
CREATE POLICY profiles_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((id = auth.uid()) OR public.is_chronus_narrator());

CREATE POLICY characters_insert_own
  ON public.characters
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY characters_update_own
  ON public.characters
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY characters_delete_own
  ON public.characters
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY characters_select_own_or_narrator
  ON public.characters
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR public.is_chronus_narrator());

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;

-- Production v1.1 hardening revokes direct execution on these two legacy helpers.
-- Minimal definitions are enough for an isolated migration rehearsal.
CREATE OR REPLACE FUNCTION public.handle_new_chronus_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN;
END;
$$;
