-- CHRONUS LIVE — isolate presence and roll history by campaign session.
BEGIN;

CREATE TABLE IF NOT EXISTS public.chronus_live_session_members (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS chronus_live_session_members_user_idx
  ON public.chronus_live_session_members (user_id, session_id);

ALTER TABLE public.chronus_live_session_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chronus_live_session_members FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.chronus_live_session_members TO authenticated, service_role;

CREATE POLICY chronus_live_session_members_select_own_or_narrator
  ON public.chronus_live_session_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR chronus_private.is_chronus_narrator());

CREATE POLICY chronus_live_session_members_insert_narrator
  ON public.chronus_live_session_members
  FOR INSERT TO authenticated
  WITH CHECK (chronus_private.is_chronus_narrator());

CREATE POLICY chronus_live_session_members_delete_narrator
  ON public.chronus_live_session_members
  FOR DELETE TO authenticated
  USING (chronus_private.is_chronus_narrator());

CREATE OR REPLACE FUNCTION chronus_private.can_access_live_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_session_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      chronus_private.is_chronus_narrator()
      OR EXISTS (
        SELECT 1
        FROM public.chronus_live_session_members AS m
        WHERE m.session_id = p_session_id
          AND m.user_id = auth.uid()
      )
    );
$function$;

REVOKE ALL ON FUNCTION chronus_private.can_access_live_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION chronus_private.can_access_live_session(UUID) TO authenticated;

CREATE POLICY campaign_sessions_live_member_select
  ON public.campaign_sessions
  FOR SELECT TO authenticated
  USING (chronus_private.can_access_live_session(id));

ALTER TABLE public.chronus_roll_events
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.campaign_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chronus_roll_events_session_created_idx
  ON public.chronus_roll_events (session_id, created_at DESC);

DROP POLICY IF EXISTS chronus_roll_events_select_table_players ON public.chronus_roll_events;
DROP POLICY IF EXISTS chronus_roll_events_select_owner_or_narrator ON public.chronus_roll_events;
CREATE POLICY chronus_roll_events_select_session_members
  ON public.chronus_roll_events
  FOR SELECT TO authenticated
  USING (chronus_private.can_access_live_session(session_id));

DROP POLICY IF EXISTS chronus_roll_events_insert_player_own ON public.chronus_roll_events;
CREATE POLICY chronus_roll_events_insert_session_player
  ON public.chronus_roll_events
  FOR INSERT TO authenticated
  WITH CHECK (
    player_user_id = (SELECT auth.uid())
    AND NOT chronus_private.is_chronus_narrator()
    AND EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'player'
    )
    AND chronus_private.can_access_live_session(session_id)
  );

CREATE OR REPLACE FUNCTION chronus_private.require_live_session_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.session_id IS NULL
     OR NOT chronus_private.can_access_live_session(NEW.session_id) THEN
    RAISE EXCEPTION 'Sessão CHRONUS LIVE ausente ou sem autorização.';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION chronus_private.require_live_session_access() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS chronus_roll_events_require_live_session ON public.chronus_roll_events;
CREATE TRIGGER chronus_roll_events_require_live_session
  BEFORE INSERT ON public.chronus_roll_events
  FOR EACH ROW EXECUTE FUNCTION chronus_private.require_live_session_access();

DROP POLICY IF EXISTS chronus_live_presence_authenticated_select ON realtime.messages;
DROP POLICY IF EXISTS chronus_live_presence_authenticated_insert ON realtime.messages;

CREATE POLICY chronus_live_presence_authenticated_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() ~ '^chronus-live:session:[0-9a-fA-F-]{36}$'
    THEN chronus_private.can_access_live_session(
      substring(realtime.topic() FROM '^chronus-live:session:([0-9a-fA-F-]{36})$')::UUID
    )
    ELSE false
  END
);

CREATE POLICY chronus_live_presence_authenticated_insert
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() ~ '^chronus-live:session:[0-9a-fA-F-]{36}$'
    THEN chronus_private.can_access_live_session(
      substring(realtime.topic() FROM '^chronus-live:session:([0-9a-fA-F-]{36})$')::UUID
    )
    ELSE false
  END
);

COMMENT ON TABLE public.chronus_live_session_members IS
  'Explicit membership for a CHRONUS LIVE campaign session. Only the Narrator manages membership.';
COMMENT ON COLUMN public.chronus_roll_events.session_id IS
  'Campaign session that owns this roll event; required for all new LIVE rolls.';
COMMENT ON POLICY chronus_live_presence_authenticated_select ON realtime.messages IS
  'Only members of the UUID-scoped CHRONUS LIVE session topic can receive presence.';
COMMENT ON POLICY chronus_live_presence_authenticated_insert ON realtime.messages IS
  'Only members of the UUID-scoped CHRONUS LIVE session topic can publish presence.';

COMMIT;
