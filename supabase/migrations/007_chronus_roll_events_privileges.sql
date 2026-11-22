-- Reassert the least-privilege grants after the initial event table migration.
REVOKE ALL ON TABLE public.chronus_roll_events FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.chronus_roll_events TO authenticated;
