-- CHRONUS: grant the trusted campaign Narrator full sheet-content editing.
-- Ownership remains immutable; player accounts keep their existing boundaries.

DROP POLICY IF EXISTS characters_update_own ON public.characters;

CREATE POLICY characters_update_owner_or_narrator
  ON public.characters
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT chronus_private.is_chronus_narrator())
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT chronus_private.is_chronus_narrator())
  );

CREATE OR REPLACE FUNCTION chronus_private.prevent_character_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'CHRONUS: character ownership cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION chronus_private.prevent_character_owner_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS characters_prevent_owner_change ON public.characters;
CREATE TRIGGER characters_prevent_owner_change
  BEFORE UPDATE OF user_id ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION chronus_private.prevent_character_owner_change();

COMMENT ON POLICY characters_update_owner_or_narrator ON public.characters IS
  'Players edit only their own sheets; the trusted CHRONUS Narrator may edit sheet content for any player. Ownership is immutable.';
