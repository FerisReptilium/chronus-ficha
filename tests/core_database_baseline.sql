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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='characters'
      AND column_name='revision' AND data_type='bigint' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'Missing non-null bigint characters.revision';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.characters'::regclass
      AND tgname='characters_set_revision' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing characters revision trigger';
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

-- Monotonic revision CAS regression. The database, not the client clock,
-- owns the revision. This remains correct even for multiple writes in one tx.
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000201"}',
  false
);
SELECT id AS cas_character_id, revision AS cas_expected_revision
FROM public.characters
WHERE user_id='00000000-0000-0000-0000-000000000201'
ORDER BY revision DESC
LIMIT 1
\gset

-- Even an attempt to forge the revision is overwritten by the trigger.
WITH accepted_write AS (
  UPDATE public.characters
     SET name='Versão mais recente confirmada', revision=999999
   WHERE id=:'cas_character_id'::uuid
     AND user_id='00000000-0000-0000-0000-000000000201'
     AND revision=:'cas_expected_revision'::bigint
  RETURNING revision
)
SELECT 1 / ((SELECT count(*) FROM accepted_write)=1)::int
  AS cas_first_write_must_succeed;

SELECT revision AS cas_new_revision
FROM public.characters
WHERE id=:'cas_character_id'::uuid
\gset

SELECT 1 / (:'cas_new_revision'::bigint = :'cas_expected_revision'::bigint + 1)::int
  AS cas_revision_must_increment_exactly_once;

WITH stale_write AS (
  UPDATE public.characters
     SET name='Escrita obsoleta não pode vencer'
   WHERE id=:'cas_character_id'::uuid
     AND user_id='00000000-0000-0000-0000-000000000201'
     AND revision=:'cas_expected_revision'::bigint
  RETURNING id
)
SELECT 1 / ((SELECT count(*) FROM stale_write)=0)::int
  AS cas_stale_write_must_be_rejected;

SELECT 1 / (name='Versão mais recente confirmada')::int
  AS cas_newer_state_must_be_preserved
FROM public.characters
WHERE id=:'cas_character_id'::uuid;

-- Two competing requests based on one revision, inside the same transaction.
BEGIN;
SELECT revision AS cas_tx_expected_revision
FROM public.characters WHERE id=:'cas_character_id'::uuid
\gset
WITH tx_accepted_write AS (
  UPDATE public.characters
     SET name='Atualização dentro da transação'
   WHERE id=:'cas_character_id'::uuid
     AND revision=:'cas_tx_expected_revision'::bigint
  RETURNING revision
)
SELECT 1 / ((SELECT count(*) FROM tx_accepted_write)=1)::int
  AS cas_tx_first_write_must_succeed;
SELECT revision AS cas_tx_new_revision
FROM public.characters WHERE id=:'cas_character_id'::uuid
\gset
WITH tx_stale_write AS (
  UPDATE public.characters
     SET name='Escrita obsoleta na mesma transação'
   WHERE id=:'cas_character_id'::uuid
     AND revision=:'cas_tx_expected_revision'::bigint
  RETURNING id
)
SELECT 1 / ((SELECT count(*) FROM tx_stale_write)=0)::int
  AS cas_tx_stale_write_must_be_rejected;
SELECT 1 / (revision=:'cas_tx_new_revision'::bigint AND name='Atualização dentro da transação')::int
  AS cas_tx_newer_state_must_be_preserved
FROM public.characters WHERE id=:'cas_character_id'::uuid;
COMMIT;

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

-- NARRATOR: can inspect and edit player sheet content, but cannot transfer
-- ownership. This is campaign administration, not Supabase/Auth administration.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000202"}',
  true
);

DO $
DECLARE
  v_count integer;
  v_rows integer;
  v_blocked boolean := false;
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
  SET name='Ficha editada pelo Narrador administrador',
      data=jsonb_set(data, '{admin_edit_test}', 'true'::jsonb)
  WHERE user_id='00000000-0000-0000-0000-000000000201';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Narrator should update player sheet content; rows=%',v_rows;
  END IF;

  BEGIN
    UPDATE public.characters
    SET user_id='00000000-0000-0000-0000-000000000203'
    WHERE user_id='00000000-0000-0000-0000-000000000201';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Narrator must not be able to transfer character ownership';
  END IF;
END $;
ROLLBACK;

SELECT 'PASS: CHRONUS Auth profile automation, email sync, player ownership and narrator campaign-admin sheet editing' AS result;
