-- Enforce immutable client access to the CHRONUS roll event log.
REVOKE ALL ON TABLE public.chronus_roll_events FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.chronus_roll_events TO authenticated;
