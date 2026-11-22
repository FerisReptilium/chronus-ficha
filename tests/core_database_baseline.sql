-- CHRONUS core baseline — Auth/profile automation and RLS regression tests.
-- Runs after the complete migration chain in an isolated local Supabase stack.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Missing public.profiles';
  END IF;
  IF to_regclass('public.characters') IS NULL THEN
    RAISE EXCEPTION 'Missing public.characters';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='portraits' AND public=false) THEN
    RAISE EXCEPTION 'Missing private portraits bucket';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass
      AND tgname='on_auth_user_created'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing Auth profile creation trigger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass
      AND tgname='on_auth_user_email_updated'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing Auth email synchronization trigger';
  END IF;
END $$;

-- Insert synthetic users only in the disposable CI database. The Auth trigger
-- must create profiles without any direct INSERT into public.profiles.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
)
VALUES
(
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','chronus-player-ci@example.invalid','',
  now(), '{"display_name":"Jogador CI"}'::jsonb, now(), now()
),
(
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','chronus-narrator-ci@example.invalid','',
  now(), '{"display_name":"Narrador CI"}'::jsonb, now(), now()
),
(
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','chronus-other-ci@example.invalid','',
  now(), '{"display_name":"Outro Jogador CI"}'::jsonb, now(), now()
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_count integer;
  v_email text;
  v_name text;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE id IN (
    '00000000-0000-0000-0000-000000000201'::uuid,
    '00000000-0000-0000-0000-000000000202'::uuid,
    '00000000-0000-0000-0000-000000000203'::uuid
  );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Auth trigger should create 3 profiles; got %', v_count;
  END IF;

  SELECT email, display_name INTO v_email, v_name
  FROM public.profiles
  WHERE id='00000000-0000-0000-0000-000000000201';
  IF v_email <> 'chronus-player-ci@example.invalid' OR v_name <> 'Jogador CI' THEN
    RAISE EXCEPTION 'Auth profile trigger did not copy email/display name';
  END IF;
END $$;

-- Email changes in Supabase Auth must be reflected in the public profile.
UPDATE auth.users
SET email='chronus-player-renamed-ci@example.invalid',
    updated_at=now()
WHERE id='00000000-0000-0000-0000-000000000201';

DO $$
BEGIN
  IF (SELECT email FROM public.profiles
      WHERE id='00000000-0000-0000-0000-000000000201')
      <> 'chronus-player-renamed-ci@example.invalid' THEN
    RAISE EXCEPTION 'Auth email update did not synchronize profile email';
  END IF;
END $$;

-- Promote the test Narrator through the trusted database owner, not an app client.
UPDATE public.profiles
SET role='narrator'
WHERE id='00000000-0000-0000-0000-000000000202';

INSERT INTO public.characters (user_id, name, data)
VALUES
('00000000-0000-0000-0000-000000000201','Personagem do Jogador CI','{"test":true}'::jsonb),
('00000000-0000-0000-0000-000000000203','Personagem de Outro Jogador CI','{"test":true}'::jsonb);

-- CAS regression uses separate autocommit statements, matching independent
-- HTTP requests from two tabs. now() is transaction-stable, so two writes
-- inside one DO/BEGIN block would intentionally share the same timestamp.
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000201"}',
  false
);
SELECT id AS cas_character_id,
       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS cas_expected_version
FROM public.characters
WHERE user_id='00000000-0000-0000-0000-000000000201'
ORDER BY updated_at DESC
LIMIT 1
\gset

WITH accepted_write AS (
  UPDATE public.characters
     SET name='Versão mais recente confirmada'
   WHERE id=:'cas_character_id'::uuid
     AND user_id='00000000-0000-0000-0000-000000000201'
     AND updated_at=:'cas_expected_version'::timestamptz
  RETURNING id
)
SELECT CASE WHEN (SELECT count(*) FROM accepted_write)=1 THEN 1 ELSE 1/0 END
  AS cas_first_write_must_succeed;

SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS cas_new_version
FROM public.characters
WHERE id=:'cas_character_id'::uuid
\gset

SELECT CASE
  WHEN :'cas_new_version'::timestamptz <> :'cas_expected_version'::timestamptz THEN 1
  ELSE 1/0
END AS cas_version_must_advance;

WITH stale_write AS (
  UPDATE public.characters
     SET name='Escrita obsoleta não pode vencer'
   WHERE id=:'cas_character_id'::uuid
     AND user_id='00000000-0000-0000-0000-000000000201'
     AND updated_at=:'cas_expected_version'::timestamptz
  RETURNING id
)
SELECT CASE WHEN (SELECT count(*) FROM stale_write)=0 THEN 1 ELSE 1/0 END
  AS cas_stale_write_must_be_rejected;

SELECT CASE
  WHEN name='Versão mais recente confirmada' THEN 1
  ELSE 1/0
END AS cas_newer_state_must_be_preserved
FROM public.characters
WHERE id=:'cas_character_id'::uuid;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

-- PLAYER: sees own profile/sheet; cannot see other users' rows or change roles.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000201"}',
  true
);

DO $$
DECLARE
  v_count integer;
  v_rows integer;
  v_blocked boolean := false;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Player should see only 1 profile; got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.characters;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Player should see only own character; got %', v_count;
  END IF;

  INSERT INTO public.characters (user_id,name,data)
  VALUES (
    '00000000-0000-0000-0000-000000000201',
    'Novo Personagem do Jogador CI',
    '{"created_by":"owner"}'::jsonb
  );

  BEGIN
    INSERT INTO public.characters (user_id,name,data)
    VALUES (
      '00000000-0000-0000-0000-000000000203',
      'Ficha Não Autorizada',
      '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Player was able to create a character for another user';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.profiles SET role='narrator'
    WHERE id='00000000-0000-0000-0000-000000000201';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Player was able to change their authorization role';
  END IF;

  UPDATE public.characters
  SET name='Personagem Atualizado pelo Dono'
  WHERE user_id='00000000-0000-0000-0000-000000000201';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'Player should update both own test characters; rows=%',v_rows;
  END IF;

  UPDATE public.characters
  SET name='Tentativa de alteração alheia'
  WHERE user_id='00000000-0000-0000-0000-000000000203';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'Player updated someone else character';
  END IF;
END $$;
ROLLBACK;

-- NARRATOR: can see the roster and every sheet, but still cannot change players' sheets.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000202"}',
  true
);

DO $$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Narrator should see all 3 profiles; got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.characters;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Narrator should see all player characters; got %', v_count;
  END IF;

  UPDATE public.characters
  SET name='Narrator must not edit player sheet'
  WHERE user_id='00000000-0000-0000-0000-000000000201';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'Narrator unexpectedly received write access to player characters';
  END IF;
END $$;
ROLLBACK;

SELECT 'PASS: CHRONUS Auth profile automation, email sync, character RLS and narrator read-only behavior' AS result;
