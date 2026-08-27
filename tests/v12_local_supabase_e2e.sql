-- CHRONUS v1.2 — local Supabase integration checks
-- Runs after migrations 001/002/003/004 inside the disposable CI database.
\set ON_ERROR_STOP on

-- Structural hardening: helpers must leave public and exist only in chronus_private.
DO $$
DECLARE
  v_public integer;
  v_private integer;
BEGIN
  SELECT count(*) INTO v_public
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('is_chronus_narrator','is_chronus_player_or_narrator','can_read_portal_asset');
  IF v_public <> 0 THEN
    RAISE EXCEPTION 'FAIL: public helper count = %', v_public;
  END IF;

  SELECT count(*) INTO v_private
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'chronus_private'
    AND p.proname IN ('is_chronus_narrator','is_chronus_player_or_narrator','can_read_portal_asset');
  IF v_private <> 3 THEN
    RAISE EXCEPTION 'FAIL: private helper count = %', v_private;
  END IF;
END $$;

-- Local auth identities. JWT role/subject are simulated with request.jwt.claims,
-- which is exactly what auth.uid() consumes in PostgreSQL policy evaluation.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','player-v12@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','narrator-v12@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other-player-v12@example.invalid','',now(),now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, email, role)
VALUES
('00000000-0000-0000-0000-000000000101','Player V12','player-v12@example.invalid','player'),
('00000000-0000-0000-0000-000000000102','Narrator V12','narrator-v12@example.invalid','narrator'),
('00000000-0000-0000-0000-000000000103','Other Player V12','other-player-v12@example.invalid','player')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

-- Seed via postgres so RLS does not interfere with fixtures.
INSERT INTO public.characters (id, user_id, name, data)
VALUES
('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','V12 Player Character','{}'::jsonb),
('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000103','V12 Other Character','{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chronicle_chapters (id, chapter_number, title, slug, content, visibility, published, published_at)
VALUES
('10000000-0000-0000-0000-000000000001',1,'Public Chapter','v12-public','public','public',true,now()-interval '1 minute'),
('10000000-0000-0000-0000-000000000002',2,'Players Chapter','v12-players','players','players',true,now()-interval '1 minute'),
('10000000-0000-0000-0000-000000000003',3,'Narrator Chapter','v12-narrator','narrator','narrator',false,null)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.portal_assets (id,bucket_id,object_path,content_type,content_id,visibility,published,published_at)
VALUES
('20000000-0000-0000-0000-000000000001','library','v12/public.pdf','chapter','10000000-0000-0000-0000-000000000001','public',true,now()-interval '1 minute'),
('20000000-0000-0000-0000-000000000002','library','v12/players.pdf','chapter','10000000-0000-0000-0000-000000000002','players',true,now()-interval '1 minute'),
('20000000-0000-0000-0000-000000000003','library','v12/private.pdf','chapter','10000000-0000-0000-0000-000000000003','narrator',false,null)
ON CONFLICT (id) DO NOTHING;

-- ANON: public editorial content only; no authenticated character/profile access.
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.chronicle_chapters WHERE slug LIKE 'v12-%';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL anon chapter visibility: %', v_count; END IF;

  IF NOT chronus_private.can_read_portal_asset('library','v12/public.pdf') THEN
    RAISE EXCEPTION 'FAIL anon public asset';
  END IF;
  IF chronus_private.can_read_portal_asset('library','v12/players.pdf') THEN
    RAISE EXCEPTION 'FAIL anon players asset leaked';
  END IF;
  IF chronus_private.can_read_portal_asset('library','v12/private.pdf') THEN
    RAISE EXCEPTION 'FAIL anon private asset leaked';
  END IF;
END $$;
ROLLBACK;

-- PLAYER: public + players editorial content; own profile and own character only.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000101"}',true);
DO $$
DECLARE
  v_count integer;
  v_rows integer;
  v_blocked boolean := false;
BEGIN
  IF NOT chronus_private.is_chronus_player_or_narrator() THEN
    RAISE EXCEPTION 'FAIL player helper false';
  END IF;
  IF chronus_private.is_chronus_narrator() THEN
    RAISE EXCEPTION 'FAIL player escalated to narrator';
  END IF;

  SELECT count(*) INTO v_count FROM public.chronicle_chapters WHERE slug LIKE 'v12-%';
  IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL player chapter visibility: %', v_count; END IF;

  IF NOT chronus_private.can_read_portal_asset('library','v12/players.pdf') THEN
    RAISE EXCEPTION 'FAIL player players asset';
  END IF;
  IF chronus_private.can_read_portal_asset('library','v12/private.pdf') THEN
    RAISE EXCEPTION 'FAIL player private asset leaked';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE id IN (
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000103'::uuid
  );
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL player profile visibility: %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.characters WHERE name LIKE 'V12 % Character';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL player character SELECT visibility: %', v_count; END IF;

  INSERT INTO public.characters (id, user_id, name, data)
  VALUES ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000101','V12 Player Temp Character','{}'::jsonb);

  BEGIN
    INSERT INTO public.characters (id, user_id, name, data)
    VALUES ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000103','V12 Forbidden Character','{}'::jsonb);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL player inserted character for another user'; END IF;

  UPDATE public.characters
     SET name = 'V12 Player Character Updated'
   WHERE id = '30000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL player own character UPDATE rows: %', v_rows; END IF;

  UPDATE public.characters
     SET name = 'V12 Other Character Illicit Update'
   WHERE id = '30000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL player updated another user character'; END IF;

  DELETE FROM public.characters
   WHERE id = '30000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL player deleted another user character'; END IF;

  DELETE FROM public.characters
   WHERE id = '30000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL player own character DELETE rows: %', v_rows; END IF;
END $$;
ROLLBACK;

-- NARRATOR: all editorial rows/assets/profiles/characters remain readable, but
-- character write ownership is not broadened by the SELECT narrator exception.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000102"}',true);
DO $$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  IF NOT chronus_private.is_chronus_narrator() THEN
    RAISE EXCEPTION 'FAIL narrator helper false';
  END IF;

  SELECT count(*) INTO v_count FROM public.chronicle_chapters WHERE slug LIKE 'v12-%';
  IF v_count <> 3 THEN RAISE EXCEPTION 'FAIL narrator chapter visibility: %', v_count; END IF;

  IF NOT chronus_private.can_read_portal_asset('library','v12/private.pdf') THEN
    RAISE EXCEPTION 'FAIL narrator private asset';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE id IN (
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000103'::uuid
  );
  IF v_count <> 3 THEN RAISE EXCEPTION 'FAIL narrator profile visibility: %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.characters WHERE name LIKE 'V12 % Character';
  IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL narrator character SELECT visibility: %', v_count; END IF;

  UPDATE public.characters
     SET name = 'V12 Narrator Illicit Update'
   WHERE id = '30000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL narrator write access broadened by initplan migration'; END IF;
END $$;
ROLLBACK;

-- Dependency check: policies must point to chronus_private after ALTER ... SET SCHEMA.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_policies
  WHERE schemaname IN ('public','storage')
    AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(^|[^a-zA-Z0-9_])public\.(is_chronus_narrator|is_chronus_player_or_narrator|can_read_portal_asset)';
  IF v_bad <> 0 THEN RAISE EXCEPTION 'FAIL policies still textual-public helper refs: %', v_bad; END IF;
END $$;

SELECT 'PASS: local migrations 003/004 integration — helper hardening, initplan optimization and RLS semantics' AS result;
