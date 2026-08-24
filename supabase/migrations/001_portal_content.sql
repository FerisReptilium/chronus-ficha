-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- MIGRATION 001: ARQUITETURA DE CONTEÚDO EDITORIAL E SEGREGAÇÃO DE SEGREDOS
-- ============================================================================
-- IMPORTANTE:
-- 1. Totalmente aditiva — preserva characters, profiles, auth.users e bucket portraits.
-- 2. RLS estrita por visibilidade (public, players, narrator) e segredos 1-to-1 privados.
-- 3. Junction tables tipadas com integridade referencial (ON DELETE CASCADE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_narrator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'narrator'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_player_or_narrator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('player', 'narrator')
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. CRÔNICA: CAPÍTULOS & ARCOS NARRATIVOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chronicle_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_number INT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT,
  content TEXT NOT NULL,
  cover_image_path TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'players', 'narrator')),
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chronicle_chapters_slug ON public.chronicle_chapters(slug);
CREATE INDEX IF NOT EXISTS idx_chronicle_chapters_visibility ON public.chronicle_chapters(visibility, published, sort_order);

-- ----------------------------------------------------------------------------
-- 3. SESSÕES: DIÁRIO DE SESSÕES & LOG DE MESA
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number INT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  session_date DATE,
  in_game_date TEXT,
  summary TEXT NOT NULL,
  events_log TEXT,
  clues_uncovered TEXT,
  cover_image_path TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('planned', 'in_progress', 'completed', 'canceled')),
  visibility TEXT NOT NULL DEFAULT 'players' CHECK (visibility IN ('public', 'players', 'narrator')),
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sessions_number ON public.campaign_sessions(session_number);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_slug ON public.campaign_sessions(slug);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_visibility ON public.campaign_sessions(visibility, published);

-- ----------------------------------------------------------------------------
-- 4. NPCS: DOSSIÊ PÚBLICO & SEGREDOS DO NARRADOR (1-TO-1)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  portrait_path TEXT,
  role_occupation TEXT,
  faction TEXT,
  apparent_age TEXT,
  public_description TEXT,
  known_personality TEXT,
  status TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'dead', 'missing', 'unknown', 'transformed')),
  relationship_to_group TEXT,
  first_appearance_session_id UUID REFERENCES public.campaign_sessions(id) ON DELETE SET NULL,
  last_appearance_session_id UUID REFERENCES public.campaign_sessions(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'players' CHECK (visibility IN ('public', 'players', 'narrator')),
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npcs_slug ON public.npcs(slug);
CREATE INDEX IF NOT EXISTS idx_npcs_visibility ON public.npcs(visibility, published);

-- Tabela Privada de Segredos de NPCs (1-to-1)
CREATE TABLE IF NOT EXISTS public.npc_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL UNIQUE REFERENCES public.npcs(id) ON DELETE CASCADE,
  true_identity TEXT,
  true_faction TEXT,
  agenda TEXT,
  secrets TEXT,
  narrator_notes TEXT,
  hidden_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npc_secrets_fk ON public.npc_secrets(npc_id);

-- ----------------------------------------------------------------------------
-- 5. LOCAIS & MAPAS: ATLAS GEOGRÁFICO & SEGREDOS (1-TO-1)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('city', 'district', 'building', 'bunker', 'club', 'facility', 'supernatural_domain', 'battlemap', 'other')),
  district_region TEXT,
  narrative_address TEXT,
  public_description TEXT,
  image_path TEXT,
  map_image_path TEXT,
  parent_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'players' CHECK (visibility IN ('public', 'players', 'narrator')),
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_slug ON public.locations(slug);
CREATE INDEX IF NOT EXISTS idx_locations_type ON public.locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_visibility ON public.locations(visibility, published);

-- Tabela Privada de Segredos de Locais (1-to-1)
CREATE TABLE IF NOT EXISTS public.location_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE CASCADE,
  narrator_notes TEXT,
  hidden_features TEXT,
  supernatural_truth TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_secrets_fk ON public.location_secrets(location_id);

-- ----------------------------------------------------------------------------
-- 6. ARQUIVOS & EVIDÊNCIAS: DOCUMENTOS & SEGREDOS (1-TO-1)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('photograph', 'letter', 'report', 'newspaper_clipping', 'official_record', 'clue', 'artifact', 'audio_log', 'other')),
  narrative_date TEXT,
  public_description TEXT,
  transcription TEXT,
  image_path TEXT,
  file_path TEXT,
  found_in_session_id UUID REFERENCES public.campaign_sessions(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'players' CHECK (visibility IN ('public', 'players', 'narrator')),
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_documents_slug ON public.campaign_documents(slug);
CREATE INDEX IF NOT EXISTS idx_campaign_documents_type ON public.campaign_documents(type);
CREATE INDEX IF NOT EXISTS idx_campaign_documents_visibility ON public.campaign_documents(visibility, published);

-- Tabela Privada de Segredos de Documentos (1-to-1)
CREATE TABLE IF NOT EXISTS public.document_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES public.campaign_documents(id) ON DELETE CASCADE,
  narrator_notes TEXT,
  hidden_meaning TEXT,
  solution_translation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_secrets_fk ON public.document_secrets(document_id);

-- ----------------------------------------------------------------------------
-- 7. TRILHA SONORA (YOUTUBE EMBED)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.soundtrack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('theme', 'investigation', 'horror', 'combat', 'suspense', 'epilogue', 'ambient')),
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soundtrack_category ON public.soundtrack(category, sort_order);

-- ----------------------------------------------------------------------------
-- 8. BIBLIOTECA OFICIAL (PDFS & LIVROS)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('system_book', 'pocket_manual', 'quick_guide', 'character_sheet', 'supplement', 'extra')),
  version TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  cover_path TEXT,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  page_count INT,
  sort_order INT NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'players', 'narrator')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_items_category ON public.library_items(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_library_items_slug ON public.library_items(slug);

-- ----------------------------------------------------------------------------
-- 9. JUNCTION TABLES TIPADAS PARA RELACIONAMENTOS
-- ----------------------------------------------------------------------------

-- Sessão <-> NPCs
CREATE TABLE IF NOT EXISTS public.session_npcs (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  role_in_session TEXT,
  PRIMARY KEY (session_id, npc_id)
);

-- Sessão <-> Locais
CREATE TABLE IF NOT EXISTS public.session_locations (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  notes TEXT,
  PRIMARY KEY (session_id, location_id)
);

-- Sessão <-> Documentos
CREATE TABLE IF NOT EXISTS public.session_documents (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.campaign_documents(id) ON DELETE CASCADE,
  discovery_context TEXT,
  PRIMARY KEY (session_id, document_id)
);

-- Capítulo <-> NPCs
CREATE TABLE IF NOT EXISTS public.chapter_npcs (
  chapter_id UUID NOT NULL REFERENCES public.chronicle_chapters(id) ON DELETE CASCADE,
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  PRIMARY KEY (chapter_id, npc_id)
);

-- Capítulo <-> Locais
CREATE TABLE IF NOT EXISTS public.chapter_locations (
  chapter_id UUID NOT NULL REFERENCES public.chronicle_chapters(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  PRIMARY KEY (chapter_id, location_id)
);

-- NPC <-> Locais
CREATE TABLE IF NOT EXISTS public.npc_locations (
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  association_type TEXT,
  PRIMARY KEY (npc_id, location_id)
);

-- NPC <-> Documentos
CREATE TABLE IF NOT EXISTS public.npc_documents (
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.campaign_documents(id) ON DELETE CASCADE,
  association_type TEXT,
  PRIMARY KEY (npc_id, document_id)
);

-- ----------------------------------------------------------------------------
-- 10. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.chronicle_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soundtrack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.session_npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_documents ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 11. POLICIES: TABELAS EDITORIAIS (3 NÍVEIS DE VISIBILIDADE)
-- ----------------------------------------------------------------------------

-- A. chronicle_chapters
CREATE POLICY "chronicle_chapters_select_policy"
  ON public.chronicle_chapters FOR SELECT
  USING (
    (visibility = 'public' AND published = true)
    OR (visibility = 'players' AND published = true AND public.is_player_or_narrator())
    OR (public.is_narrator())
  );

CREATE POLICY "chronicle_chapters_admin_policy"
  ON public.chronicle_chapters FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- B. campaign_sessions
CREATE POLICY "campaign_sessions_select_policy"
  ON public.campaign_sessions FOR SELECT
  USING (
    (visibility = 'public' AND published = true)
    OR (visibility = 'players' AND published = true AND public.is_player_or_narrator())
    OR (public.is_narrator())
  );

CREATE POLICY "campaign_sessions_admin_policy"
  ON public.campaign_sessions FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- C. npcs
CREATE POLICY "npcs_select_policy"
  ON public.npcs FOR SELECT
  USING (
    (visibility = 'public' AND published = true)
    OR (visibility = 'players' AND published = true AND public.is_player_or_narrator())
    OR (public.is_narrator())
  );

CREATE POLICY "npcs_admin_policy"
  ON public.npcs FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- D. locations
CREATE POLICY "locations_select_policy"
  ON public.locations FOR SELECT
  USING (
    (visibility = 'public' AND published = true)
    OR (visibility = 'players' AND published = true AND public.is_player_or_narrator())
    OR (public.is_narrator())
  );

CREATE POLICY "locations_admin_policy"
  ON public.locations FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- E. campaign_documents
CREATE POLICY "campaign_documents_select_policy"
  ON public.campaign_documents FOR SELECT
  USING (
    (visibility = 'public' AND published = true)
    OR (visibility = 'players' AND published = true AND public.is_player_or_narrator())
    OR (public.is_narrator())
  );

CREATE POLICY "campaign_documents_admin_policy"
  ON public.campaign_documents FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- F. library_items
CREATE POLICY "library_items_select_policy"
  ON public.library_items FOR SELECT
  USING (
    (visibility = 'public' AND published = true)
    OR (visibility = 'players' AND published = true AND public.is_player_or_narrator())
    OR (public.is_narrator())
  );

CREATE POLICY "library_items_admin_policy"
  ON public.library_items FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- G. soundtrack
CREATE POLICY "soundtrack_select_policy"
  ON public.soundtrack FOR SELECT
  USING (active = true OR public.is_narrator());

CREATE POLICY "soundtrack_admin_policy"
  ON public.soundtrack FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- ----------------------------------------------------------------------------
-- 12. POLICIES: TABELAS DE SEGREDOS (EXCLUSIVO NARRADOR)
-- ----------------------------------------------------------------------------

CREATE POLICY "npc_secrets_narrator_only"
  ON public.npc_secrets FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

CREATE POLICY "location_secrets_narrator_only"
  ON public.location_secrets FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

CREATE POLICY "document_secrets_narrator_only"
  ON public.document_secrets FOR ALL
  USING (public.is_narrator())
  WITH CHECK (public.is_narrator());

-- ----------------------------------------------------------------------------
-- 13. POLICIES: JUNCTION TABLES
-- ----------------------------------------------------------------------------

CREATE POLICY "session_npcs_select" ON public.session_npcs FOR SELECT USING (true);
CREATE POLICY "session_npcs_admin" ON public.session_npcs FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

CREATE POLICY "session_locations_select" ON public.session_locations FOR SELECT USING (true);
CREATE POLICY "session_locations_admin" ON public.session_locations FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

CREATE POLICY "session_documents_select" ON public.session_documents FOR SELECT USING (true);
CREATE POLICY "session_documents_admin" ON public.session_documents FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

CREATE POLICY "chapter_npcs_select" ON public.chapter_npcs FOR SELECT USING (true);
CREATE POLICY "chapter_npcs_admin" ON public.chapter_npcs FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

CREATE POLICY "chapter_locations_select" ON public.chapter_locations FOR SELECT USING (true);
CREATE POLICY "chapter_locations_admin" ON public.chapter_locations FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

CREATE POLICY "npc_locations_select" ON public.npc_locations FOR SELECT USING (true);
CREATE POLICY "npc_locations_admin" ON public.npc_locations FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

CREATE POLICY "npc_documents_select" ON public.npc_documents FOR SELECT USING (true);
CREATE POLICY "npc_documents_admin" ON public.npc_documents FOR ALL USING (public.is_narrator()) WITH CHECK (public.is_narrator());

-- ----------------------------------------------------------------------------
-- 14. BUCKETS DE STORAGE (DEFINIÇÃO ADITIVA)
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('campaign-images', 'campaign-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('maps', 'maps', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('documents', 'documents', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('library', 'library', true, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies de Storage
CREATE POLICY "Public Read for campaign-images" ON storage.objects FOR SELECT USING (bucket_id = 'campaign-images');
CREATE POLICY "Narrator Upload for campaign-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'campaign-images' AND public.is_narrator());
CREATE POLICY "Narrator Update for campaign-images" ON storage.objects FOR UPDATE USING (bucket_id = 'campaign-images' AND public.is_narrator());
CREATE POLICY "Narrator Delete for campaign-images" ON storage.objects FOR DELETE USING (bucket_id = 'campaign-images' AND public.is_narrator());

CREATE POLICY "Public Read for maps" ON storage.objects FOR SELECT USING (bucket_id = 'maps');
CREATE POLICY "Narrator Upload for maps" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'maps' AND public.is_narrator());
CREATE POLICY "Narrator Update for maps" ON storage.objects FOR UPDATE USING (bucket_id = 'maps' AND public.is_narrator());
CREATE POLICY "Narrator Delete for maps" ON storage.objects FOR DELETE USING (bucket_id = 'maps' AND public.is_narrator());

CREATE POLICY "Public Read for documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Narrator Upload for documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents' AND public.is_narrator());
CREATE POLICY "Narrator Update for documents" ON storage.objects FOR UPDATE USING (bucket_id = 'documents' AND public.is_narrator());
CREATE POLICY "Narrator Delete for documents" ON storage.objects FOR DELETE USING (bucket_id = 'documents' AND public.is_narrator());

CREATE POLICY "Public Read for library" ON storage.objects FOR SELECT USING (bucket_id = 'library');
CREATE POLICY "Narrator Upload for library" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'library' AND public.is_narrator());
CREATE POLICY "Narrator Update for library" ON storage.objects FOR UPDATE USING (bucket_id = 'library' AND public.is_narrator());
CREATE POLICY "Narrator Delete for library" ON storage.objects FOR DELETE USING (bucket_id = 'library' AND public.is_narrator());
