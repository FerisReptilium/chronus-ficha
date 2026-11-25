-- CHRONUS live roll feed — RLS, immutability, validation and Realtime publication tests.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public.chronus_roll_events') IS NULL THEN
    RAISE EXCEPTION 'Missing public.chronus_roll_events';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.chronus_roll_events'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on chronus_roll_events';
  END IF;
  IF has_table_privilege('anon','public.chronus_roll_events','SELECT')
     OR has_table_privilege('anon','public.chronus_roll_events','INSERT') THEN
    RAISE EXCEPTION 'Anonymous role must not access chronus_roll_events';
  END IF;
  IF has_table_privilege('service_role','public.chronus_roll_events','SELECT')
     OR has_table_privilege('service_role','public.chronus_roll_events','INSERT') THEN
    RAISE EXCEPTION 'Service role grants must remain revoked for this client-facing event table';
  END IF;
  IF NOT has_table_privilege('authenticated','public.chronus_roll_events','SELECT')
     OR NOT has_table_privilege('authenticated','public.chronus_roll_events','INSERT') THEN
    RAISE EXCEPTION 'Authenticated role requires SELECT and INSERT';
  END IF;
  IF has_table_privilege('authenticated','public.chronus_roll_events','UPDATE')
     OR has_table_privilege('authenticated','public.chronus_roll_events','DELETE') THEN
    RAISE EXCEPTION 'Roll events must be immutable to authenticated clients';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='chronus_roll_events'
  ) THEN
    RAISE EXCEPTION 'chronus_roll_events is missing from supabase_realtime publication';
  END IF;
END $$;


DO $$
DECLARE v_policy record;
BEGIN
  SELECT cmd, roles, qual INTO v_policy
  FROM pg_policies
  WHERE schemaname='realtime'
    AND tablename='messages'
    AND policyname='chronus_live_presence_authenticated_select';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing authenticated private LIVE presence policy';
  END IF;
  IF v_policy.cmd <> 'SELECT'
     OR NOT ('authenticated' = ANY(v_policy.roles))
     OR v_policy.qual NOT LIKE '%chronus-live:session:%'
     OR v_policy.qual NOT LIKE '%can_access_live_session%' THEN
    RAISE EXCEPTION 'LIVE presence policy is not scoped to authenticated CHRONUS players/narrators: %', v_policy;
  END IF;
END $$;


DO $$
DECLARE v_insert_policy record;
BEGIN
  SELECT cmd, roles, with_check INTO v_insert_policy
  FROM pg_policies
  WHERE schemaname='realtime'
    AND tablename='messages'
    AND policyname='chronus_live_presence_authenticated_insert';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing authenticated private LIVE presence insert policy';
  END IF;
  IF v_insert_policy.cmd <> 'INSERT'
     OR NOT ('authenticated' = ANY(v_insert_policy.roles))
     OR v_insert_policy.with_check NOT LIKE '%chronus-live:session:%'
     OR v_insert_policy.with_check NOT LIKE '%can_access_live_session%' THEN
    RAISE EXCEPTION 'LIVE presence INSERT policy is not scoped to authenticated CHRONUS players/narrators: %', v_insert_policy;
  END IF;
END $$;

DO $
DECLARE v_policy record;
BEGIN
  SELECT cmd, roles, qual INTO v_policy
  FROM pg_policies
  WHERE schemaname='realtime' AND tablename='messages'
    AND policyname='chronus_live_roll_feed_authenticated_select';
  IF NOT FOUND OR v_policy.cmd <> 'SELECT'
     OR NOT ('authenticated' = ANY(v_policy.roles))
     OR v_policy.qual NOT LIKE '%chronus-rolls:session:%'
     OR v_policy.qual NOT LIKE '%can_access_live_session%' THEN
    RAISE EXCEPTION 'Private roll feed topic must be restricted to authenticated session members: %', v_policy;
  END IF;
END $;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
)
VALUES
('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roll-player-a@example.invalid','',now(), '{"display_name":"Jogador A"}'::jsonb,now(),now()),
('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roll-player-b@example.invalid','',now(), '{"display_name":"Jogador B"}'::jsonb,now(),now()),
('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roll-narrator@example.invalid','',now(), '{"display_name":"Narrador"}'::jsonb,now(),now())
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET role='narrator'
WHERE id='00000000-0000-0000-0000-000000000303';

INSERT INTO public.campaign_sessions (
  id, session_number, title, slug, summary, status, visibility, published, created_by
) VALUES
('00000000-0000-0000-0000-000000000401',990301,'Sessão A','live-e2e-a','Sessão de teste A','in_progress','narrator',false,'00000000-0000-0000-0000-000000000303'),
('00000000-0000-0000-0000-000000000402',990302,'Sessão B','live-e2e-b','Sessão de teste B','in_progress','narrator',false,'00000000-0000-0000-0000-000000000303')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chronus_live_session_members (session_id,user_id,created_by) VALUES
('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000303'),
('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000303'),
('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000303')
ON CONFLICT DO NOTHING;

-- Player A inserts a normal roll with three matching base dice and the special d12.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000301"}',true);
INSERT INTO public.chronus_roll_events (
  session_id, character_name, action_label, roll_mode, dice, difficulty,
  highest_result, margin, outcome, narrative_authority,
  acts_awarded, condition_awarded
)
VALUES (
  '00000000-0000-0000-0000-000000000401', 'Personagem A', 'Teste de força', 'Teste guiado',
  '[{"sides":8,"value":4,"determination":false},{"sides":8,"value":7,"determination":false},{"sides":8,"value":5,"determination":false},{"sides":12,"value":10,"determination":true}]'::jsonb,
  6, 10, 4, 'exceptional_success', 'player', 1, true
);
DO $$
DECLARE v_count integer; v_name text; v_det boolean;
BEGIN
  SELECT count(*), min(player_display_name), bool_or(determination_used)
  INTO v_count, v_name, v_det
  FROM public.chronus_roll_events;
  IF v_count <> 1 OR v_name <> 'Jogador A' OR NOT v_det THEN
    RAISE EXCEPTION 'Player A event was not saved or server-derived fields are incorrect';
  END IF;
END $$;
COMMIT;

-- Player B creates a second event through their own authenticated session.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000302"}',true);
INSERT INTO public.chronus_roll_events (
  session_id, character_name, action_label, roll_mode, dice, difficulty,
  highest_result, margin, outcome, narrative_authority,
  acts_awarded, condition_awarded
)
VALUES (
  '00000000-0000-0000-0000-000000000401','Personagem B','Ação B','Rolagem rápida',
  '[{"sides":6,"value":6,"determination":false}]'::jsonb,
  6,6,0,'partial_success','shared',0,false
);
INSERT INTO public.chronus_roll_events (
  session_id, character_name, action_label, roll_mode, dice, difficulty,
  highest_result, margin, outcome, narrative_authority, acts_awarded, condition_awarded
)
VALUES (
  '00000000-0000-0000-0000-000000000402','Personagem B','Ação exclusiva B','Rolagem rápida',
  '[{"sides":6,"value":5,"determination":false}]'::jsonb,
  4,5,1,'success','player',0,false
);
COMMIT;

-- Player B belongs to both sessions and can see both session feeds.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000302"}',true);
DO $
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.chronus_roll_events;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Player B should see three events across their two sessions; got %',v_count; END IF;
END $;
ROLLBACK;

-- Player A sees the shared table events and cannot create a narrator-owned event.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000301"}',true);
DO $$
DECLARE v_count integer; v_blocked boolean := false;
BEGIN
  SELECT count(*) INTO v_count FROM public.chronus_roll_events;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Player A should see only the two events in Session A; got %',v_count; END IF;
  IF EXISTS (SELECT 1 FROM public.chronus_roll_events WHERE session_id='00000000-0000-0000-0000-000000000402') THEN
    RAISE EXCEPTION 'Player A read a roll from Session B';
  END IF;
  BEGIN
    INSERT INTO public.chronus_roll_events (
      session_id, player_user_id, action_label, dice, difficulty, highest_result, margin,
      outcome, narrative_authority, acts_awarded, condition_awarded
    )
    VALUES (
      '00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000302','Spoof',
      '[{"sides":8,"value":8,"determination":false}]'::jsonb,
      6,8,2,'success','player',0,false
    );
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Player A inserted an event for Player B'; END IF;
END $$;
ROLLBACK;

-- Narrator sees the full live table and cannot insert a player roll.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000303"}',true);
DO $$
DECLARE v_count integer; v_blocked boolean := false;
BEGIN
  SELECT count(*) INTO v_count FROM public.chronus_roll_events;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Narrator should see all three authorized session events; got %',v_count; END IF;
  BEGIN
    INSERT INTO public.chronus_roll_events (
      action_label, dice, difficulty, highest_result, margin,
      outcome, narrative_authority, acts_awarded, condition_awarded
    )
    VALUES (
      'Narrador tenta rolar','[{"sides":8,"value":8,"determination":false}]'::jsonb,
      6,8,2,'success','player',0,false
    );
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Narrator was able to insert a player roll'; END IF;
END $$;
ROLLBACK;

SELECT 'PASS: CHRONUS roll event RLS, player-only inserts, narrator feed, immutability and Realtime publication' AS result;
