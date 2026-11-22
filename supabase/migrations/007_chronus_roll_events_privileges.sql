-- Remove default grants inherited by new public tables.
REVOKE ALL ON TABLE public.chronus_roll_events FROM anon, service_role;
GRANT SELECT, INSERT ON TABLE public.chronus_roll_events TO authenticated;
