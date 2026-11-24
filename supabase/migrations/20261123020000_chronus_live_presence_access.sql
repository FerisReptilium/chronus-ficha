-- CHRONUS LIVE — authorize private Realtime presence for the single shared table.
-- Only authenticated users with a trusted CHRONUS player/narrator profile may
-- subscribe to the shared room-presence topic. No media or user-controlled role data.
BEGIN;

DROP POLICY IF EXISTS chronus_live_presence_authenticated_select ON realtime.messages;
DROP POLICY IF EXISTS chronus_live_presence_authenticated_insert ON realtime.messages;

CREATE POLICY chronus_live_presence_authenticated_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'chronus-live:main-table'
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('player', 'narrator')
  )
);


CREATE POLICY chronus_live_presence_authenticated_insert
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = 'chronus-live:main-table'
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('player', 'narrator')
  )
);

COMMENT ON POLICY chronus_live_presence_authenticated_insert ON realtime.messages IS
  'Allows authenticated CHRONUS players and narrators to publish presence only to the private shared-table topic.';

COMMENT ON POLICY chronus_live_presence_authenticated_select ON realtime.messages IS
  'Allows authenticated CHRONUS players and narrators to join the private presence channel for the single shared table.';

COMMIT;
