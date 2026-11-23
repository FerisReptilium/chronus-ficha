-- Share roll events with authenticated players in the single shared CHRONUS chronicle.
-- The application currently has one global campaign and no campaign membership model.
-- If multiple isolated campaigns are introduced, scope this policy by session membership first.
BEGIN;
DROP POLICY IF EXISTS chronus_roll_events_select_owner_or_narrator ON public.chronus_roll_events;
CREATE POLICY chronus_roll_events_select_table_players
ON public.chronus_roll_events
FOR SELECT
TO authenticated
USING (
  chronus_private.is_chronus_narrator()
  OR player_user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'player'
  )
);
COMMENT ON TABLE public.chronus_roll_events IS
  'Immutable roll log for the shared CHRONUS chronicle. Authenticated players can see table rolls; narrators can see all rolls.';
COMMIT;
