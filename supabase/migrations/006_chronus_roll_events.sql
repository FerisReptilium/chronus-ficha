-- CHRONUS — Live roll events for narrator synchronization
BEGIN;
CREATE TABLE public.chronus_roll_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  player_display_name TEXT NOT NULL DEFAULT 'Jogador',
  character_name TEXT NOT NULL DEFAULT '',
  action_label TEXT NOT NULL DEFAULT 'Teste CHRONUS',
  roll_mode TEXT NOT NULL DEFAULT 'Teste guiado' CHECK (roll_mode IN ('Teste guiado', 'Rolagem rápida')),
  dice JSONB NOT NULL,
  difficulty SMALLINT NOT NULL CHECK (difficulty IN (4, 5, 6, 7)),
  highest_result SMALLINT NOT NULL CHECK (highest_result BETWEEN 1 AND 12),
  margin SMALLINT NOT NULL,
  outcome TEXT NOT NULL,
  narrative_authority TEXT NOT NULL CHECK (narrative_authority IN ('player', 'shared', 'narrator')),
  determination_used BOOLEAN NOT NULL DEFAULT false,
  acts_awarded SMALLINT NOT NULL DEFAULT 0 CHECK (acts_awarded IN (0, 1)),
  condition_awarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chronus_roll_events_dice_array_check CHECK (
    CASE WHEN jsonb_typeof(dice) = 'array' THEN jsonb_array_length(dice) BETWEEN 1 AND 4 ELSE false END
  ),
  CONSTRAINT chronus_roll_events_margin_check CHECK (margin = highest_result - difficulty),
  CONSTRAINT chronus_roll_events_outcome_check CHECK (
    outcome = CASE
      WHEN margin >= 3 THEN 'exceptional_success'
      WHEN margin >= 1 THEN 'success'
      WHEN margin = 0 THEN 'partial_success'
      WHEN margin >= -2 THEN 'failure'
      ELSE 'critical_failure'
    END
  ),
  CONSTRAINT chronus_roll_events_authority_check CHECK (
    narrative_authority = CASE
      WHEN outcome IN ('exceptional_success', 'success') THEN 'player'
      WHEN outcome = 'partial_success' THEN 'shared'
      ELSE 'narrator'
    END
  ),
  CONSTRAINT chronus_roll_events_acts_check CHECK (
    acts_awarded = CASE WHEN outcome IN ('exceptional_success', 'critical_failure') THEN 1 ELSE 0 END
  ),
  CONSTRAINT chronus_roll_events_condition_check CHECK (
    condition_awarded = (outcome = 'exceptional_success')
  )
);
CREATE INDEX chronus_roll_events_created_at_idx ON public.chronus_roll_events (created_at DESC);
CREATE INDEX chronus_roll_events_player_created_at_idx ON public.chronus_roll_events (player_user_id, created_at DESC);
ALTER TABLE public.chronus_roll_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE public.chronus_roll_events TO authenticated;
CREATE POLICY chronus_roll_events_select_owner_or_narrator ON public.chronus_roll_events
  FOR SELECT TO authenticated
  USING (player_user_id = (SELECT auth.uid()) OR chronus_private.is_chronus_narrator());
CREATE POLICY chronus_roll_events_insert_player_own ON public.chronus_roll_events
  FOR INSERT TO authenticated
  WITH CHECK (
    player_user_id = (SELECT auth.uid())
    AND NOT chronus_private.is_chronus_narrator()
    AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = (SELECT auth.uid()) AND p.role = 'player')
  );
CREATE OR REPLACE FUNCTION chronus_private.prepare_chronus_roll_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_die JSONB;
  v_sides INTEGER;
  v_value INTEGER;
  v_is_determination BOOLEAN;
  v_base_count INTEGER := 0;
  v_determination_count INTEGER := 0;
  v_base_sides INTEGER;
  v_highest INTEGER := 0;
  v_display_name TEXT;
BEGIN
  IF NEW.player_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Jogador inválido para registrar esta rolagem.';
  END IF;
  FOR v_die IN SELECT value FROM jsonb_array_elements(NEW.dice) LOOP
    IF jsonb_typeof(v_die) <> 'object'
       OR jsonb_typeof(v_die->'sides') <> 'number'
       OR jsonb_typeof(v_die->'value') <> 'number'
       OR jsonb_typeof(v_die->'determination') <> 'boolean' THEN
      RAISE EXCEPTION 'Estrutura de dado inválida.';
    END IF;
    v_sides := (v_die->>'sides')::INTEGER;
    v_value := (v_die->>'value')::INTEGER;
    v_is_determination := (v_die->>'determination')::BOOLEAN;
    IF v_sides NOT IN (4, 6, 8, 10, 12) OR v_value < 1 OR v_value > v_sides THEN
      RAISE EXCEPTION 'Faces ou resultado de dado inválido.';
    END IF;
    IF v_is_determination THEN
      IF v_sides <> 12 THEN RAISE EXCEPTION 'O dado de Determinação deve ser d12.'; END IF;
      v_determination_count := v_determination_count + 1;
    ELSE
      v_base_count := v_base_count + 1;
      IF v_base_sides IS NULL THEN v_base_sides := v_sides;
      ELSIF v_base_sides <> v_sides THEN RAISE EXCEPTION 'Os dados básicos devem possuir o mesmo tipo de dado.';
      END IF;
    END IF;
    v_highest := GREATEST(v_highest, v_value);
  END LOOP;
  IF v_base_count NOT BETWEEN 1 AND 3 OR v_determination_count > 1 THEN
    RAISE EXCEPTION 'A jogada deve ter de um a três dados básicos e no máximo um d12 de Determinação.';
  END IF;
  IF NEW.highest_result <> v_highest THEN RAISE EXCEPTION 'Maior resultado informado não corresponde aos dados.'; END IF;
  NEW.determination_used := (v_determination_count = 1);
  SELECT COALESCE(NULLIF(BTRIM(p.display_name), ''), 'Jogador') INTO v_display_name
  FROM public.profiles AS p WHERE p.id = NEW.player_user_id;
  IF v_display_name IS NULL THEN RAISE EXCEPTION 'Perfil CHRONUS do jogador não encontrado.'; END IF;
  NEW.player_display_name := v_display_name;
  NEW.character_name := LEFT(COALESCE(NEW.character_name, ''), 120);
  NEW.action_label := LEFT(COALESCE(NULLIF(BTRIM(NEW.action_label), ''), 'Teste CHRONUS'), 160);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION chronus_private.prepare_chronus_roll_event() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER chronus_roll_events_prepare BEFORE INSERT ON public.chronus_roll_events
  FOR EACH ROW EXECUTE FUNCTION chronus_private.prepare_chronus_roll_event();
DO $publication$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chronus_roll_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chronus_roll_events;
  END IF;
END;
$publication$;
COMMENT ON TABLE public.chronus_roll_events IS
  'Immutable CHRONUS player roll log. Players can insert/read their own events; Narrators can read all events for the live table feed.';
COMMIT;
