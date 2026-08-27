-- CHRONUS v1.2 local-only baseline fixture.
-- This file is never applied to production. It recreates only the pre-v1.1
-- objects required by migrations 001/002/003 inside a disposable Supabase stack.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','narrator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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
