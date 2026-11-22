-- CHRONUS — Monotonic optimistic-concurrency version for character sheets.
-- This additive migration is safe for existing rows: every current character
-- starts at revision 1, and all future updates advance it atomically.
BEGIN;

ALTER TABLE public.characters
  ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.characters
  ADD CONSTRAINT characters_revision_positive CHECK (revision > 0);

COMMENT ON COLUMN public.characters.revision IS
  'Database-owned monotonic version for compare-and-swap character synchronization.';

CREATE OR REPLACE FUNCTION public.handle_character_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
  ELSE
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_character_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER characters_set_revision
  BEFORE INSERT OR UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_character_revision();

COMMIT;
