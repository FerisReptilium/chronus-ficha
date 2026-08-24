-- ============================================================================
-- CHRONUS — ECOLOGIA SOBRENATURAL
-- MIGRATION 001: ARQUITETURA DE CONTEÚDO EDITORIAL & STORAGE AUDITADO (v3.0)
-- ============================================================================
-- DIRETRIZES DE ENGENHARIA & SEGURANÇA MÁXIMA:
-- 1. 100% Aditiva: Preserva public.characters, public.profiles, auth.users e bucket portraits.
-- 2. Não recria nem modifica a função existente public.is_chronus_narrator().
-- 3. Nova função public.is_chronus_player_or_narrator() com search_path = '' e referências qualificadas.
-- 4. Tabela public.portal_assets: Registro de auditoria e governança do ciclo editorial do Storage.
-- 5. Storage Default-Deny: storage.objects só permite download se houver portal_assets publicado
--    correspondente e dentro da visibilidade permitida.
-- 6. Storage UPDATE com USING e WITH CHECK rigorosos.
-- 7. RLS de Junction Tables com verificação bilateral obrigatória.
-- 8. Soundtrack com suporte completo a visibility, published e published_at.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO (SECURITY DEFINER & HARDENED)
-- ----------------------------------------------------------------------------

-- NOTA: public.is_chronus_narrator() já existe no projeto Supabase e NÃO É RECRIADA aqui.

-- Nova função auxiliar para checagem conjunta de jogador ou narrador
CREATE OR REPLACE FUNCTION public.is_chronus_player_or_narrator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('player', 'narrator')
  );
$$;

REVOKE ALL ON FUNCTION public.is_chronus_player_or_narrator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chronus_player_or_narrator() TO anon, authenticated, service_role;

-- Função genérica de atualização de timestamp
CREATE OR REPLACE FUNCTION public.handle_chronus_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. REGISTRO CENTRAL DE ASSETS DE STORAGE (portal_assets)
-- ----------------------------------------------------------------------------
-- Governa a publicação, visibilidade e ciclo de vida de todo arquivo armazenado
-- nos buckets da campanha. Impede download de rascunhos ou arquivos órfãos.

CREATE TABLE IF NOT EXISTS public.portal_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL,
  object_path TEXT NOT NULL,
  content_type TEXT,
  content_id UUID, -- Referência opcional à entidade (capítulo, sessão, npc, local, doc, library)
  visibility TEXT NOT NULL DEFAULT 'players' CHECK (visibility IN ('public', 'players', 'narrator')),
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_portal_assets_bucket_path UNIQUE (bucket_id, object_path)
);

CREATE INDEX IF NOT EXISTS idx_portal_assets_lookup ON public.portal_assets(bucket_id, object_path);
CREATE INDEX IF NOT EXISTS idx_portal_assets_access ON public.portal_assets(visibility, published, published_at);
CREATE INDEX IF NOT EXISTS idx_portal_assets_content ON public.portal_assets(content_id);

CREATE OR REPLACE TRIGGER trg_portal_assets_updated_at
  BEFORE UPDATE ON public.portal_assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 3. CRÔNICA: CAPÍTULOS & ARCOS NARRATIVOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chronicle_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_number INT, -- Nullable para acomodar Prólogo (NULL ou 0)
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
CREATE INDEX IF NOT EXISTS idx_chronicle_chapters_listing ON public.chronicle_chapters(visibility, published, published_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_chronicle_chapters_created_by ON public.chronicle_chapters(created_by);

CREATE OR REPLACE TRIGGER trg_chronicle_chapters_updated_at
  BEFORE UPDATE ON public.chronicle_chapters
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 4. SESSÕES: DIÁRIO DE SESSÕES & LOG DE MESA
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
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_date ON public.campaign_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_listing ON public.campaign_sessions(visibility, published, published_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_created_by ON public.campaign_sessions(created_by);

CREATE OR REPLACE TRIGGER trg_campaign_sessions_updated_at
  BEFORE UPDATE ON public.campaign_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 5. NPCS: DOSSIÊ PÚBLICO & SEGREDOS DO NARRADOR (1-TO-1)
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
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npcs_slug ON public.npcs(slug);
CREATE INDEX IF NOT EXISTS idx_npcs_listing ON public.npcs(visibility, published, published_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_npcs_first_session ON public.npcs(first_appearance_session_id);
CREATE INDEX IF NOT EXISTS idx_npcs_last_session ON public.npcs(last_appearance_session_id);
CREATE INDEX IF NOT EXISTS idx_npcs_created_by ON public.npcs(created_by);

CREATE OR REPLACE TRIGGER trg_npcs_updated_at
  BEFORE UPDATE ON public.npcs
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- TABELA PRIVADA DE SEGREDOS DE NPCS (1-TO-1 — SOMENTE NARRADOR)
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

CREATE INDEX IF NOT EXISTS idx_npc_secrets_npc_id ON public.npc_secrets(npc_id);

CREATE OR REPLACE TRIGGER trg_npc_secrets_updated_at
  BEFORE UPDATE ON public.npc_secrets
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 6. LOCAIS & MAPAS: ATLAS GEOGRÁFICO & SEGREDOS (1-TO-1)
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
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_slug ON public.locations(slug);
CREATE INDEX IF NOT EXISTS idx_locations_type ON public.locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_parent ON public.locations(parent_location_id);
CREATE INDEX IF NOT EXISTS idx_locations_listing ON public.locations(visibility, published, published_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_locations_created_by ON public.locations(created_by);

CREATE OR REPLACE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- TABELA PRIVADA DE SEGREDOS DE LOCAIS (1-TO-1 — SOMENTE NARRADOR)
CREATE TABLE IF NOT EXISTS public.location_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE CASCADE,
  narrator_notes TEXT,
  hidden_features TEXT,
  supernatural_truth TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_secrets_location_id ON public.location_secrets(location_id);

CREATE OR REPLACE TRIGGER trg_location_secrets_updated_at
  BEFORE UPDATE ON public.location_secrets
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 7. ARQUIVOS & EVIDÊNCIAS: DOCUMENTOS & SEGREDOS (1-TO-1)
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
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_documents_slug ON public.campaign_documents(slug);
CREATE INDEX IF NOT EXISTS idx_campaign_documents_type ON public.campaign_documents(type);
CREATE INDEX IF NOT EXISTS idx_campaign_documents_session ON public.campaign_documents(found_in_session_id);
CREATE INDEX IF NOT EXISTS idx_campaign_documents_listing ON public.campaign_documents(visibility, published, published_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_campaign_documents_created_by ON public.campaign_documents(created_by);

CREATE OR REPLACE TRIGGER trg_campaign_documents_updated_at
  BEFORE UPDATE ON public.campaign_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- TABELA PRIVADA DE SEGREDOS DE DOCUMENTOS (1-TO-1 — SOMENTE NARRADOR)
CREATE TABLE IF NOT EXISTS public.document_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES public.campaign_documents(id) ON DELETE CASCADE,
  narrator_notes TEXT,
  hidden_meaning TEXT,
  solution_translation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_secrets_doc_id ON public.document_secrets(document_id);

CREATE OR REPLACE TRIGGER trg_document_secrets_updated_at
  BEFORE UPDATE ON public.document_secrets
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 8. TRILHA SONORA (YOUTUBE EMBED COM VISIBILIDADE & PUBLICAÇÃO)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.soundtrack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('theme', 'investigation', 'horror', 'combat', 'suspense', 'epilogue', 'ambient')),
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'players', 'narrator')),
  active BOOLEAN NOT NULL DEFAULT true,
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soundtrack_listing ON public.soundtrack(category, visibility, published, sort_order);
CREATE INDEX IF NOT EXISTS idx_soundtrack_created_by ON public.soundtrack(created_by);

CREATE OR REPLACE TRIGGER trg_soundtrack_updated_at
  BEFORE UPDATE ON public.soundtrack
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 9. BIBLIOTECA OFICIAL (PDFS & LIVROS)
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
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_items_slug ON public.library_items(slug);
CREATE INDEX IF NOT EXISTS idx_library_items_listing ON public.library_items(category, visibility, published, sort_order);
CREATE INDEX IF NOT EXISTS idx_library_items_created_by ON public.library_items(created_by);

CREATE OR REPLACE TRIGGER trg_library_items_updated_at
  BEFORE UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_chronus_updated_at();

-- ----------------------------------------------------------------------------
-- 10. JUNCTION TABLES TIPADAS PARA RELACIONAMENTOS
-- ----------------------------------------------------------------------------

-- Sessão <-> NPCs
CREATE TABLE IF NOT EXISTS public.session_npcs (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  role_in_session TEXT,
  PRIMARY KEY (session_id, npc_id)
);
CREATE INDEX IF NOT EXISTS idx_session_npcs_npc_id ON public.session_npcs(npc_id);

-- Sessão <-> Locais
CREATE TABLE IF NOT EXISTS public.session_locations (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  notes TEXT,
  PRIMARY KEY (session_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_session_locations_loc_id ON public.session_locations(location_id);

-- Sessão <-> Documentos
CREATE TABLE IF NOT EXISTS public.session_documents (
  session_id UUID NOT NULL REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.campaign_documents(id) ON DELETE CASCADE,
  discovery_context TEXT,
  PRIMARY KEY (session_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_session_documents_doc_id ON public.session_documents(document_id);

-- Capítulo <-> NPCs
CREATE TABLE IF NOT EXISTS public.chapter_npcs (
  chapter_id UUID NOT NULL REFERENCES public.chronicle_chapters(id) ON DELETE CASCADE,
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  PRIMARY KEY (chapter_id, npc_id)
);
CREATE INDEX IF NOT EXISTS idx_chapter_npcs_npc_id ON public.chapter_npcs(npc_id);

-- Capítulo <-> Locais
CREATE TABLE IF NOT EXISTS public.chapter_locations (
  chapter_id UUID NOT NULL REFERENCES public.chronicle_chapters(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  PRIMARY KEY (chapter_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_chapter_locations_loc_id ON public.chapter_locations(location_id);

-- NPC <-> Locais
CREATE TABLE IF NOT EXISTS public.npc_locations (
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  association_type TEXT,
  PRIMARY KEY (npc_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_npc_locations_loc_id ON public.npc_locations(location_id);

-- NPC <-> Documentos
CREATE TABLE IF NOT EXISTS public.npc_documents (
  npc_id UUID NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.campaign_documents(id) ON DELETE CASCADE,
  association_type TEXT,
  PRIMARY KEY (npc_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_npc_documents_doc_id ON public.npc_documents(document_id);

-- ----------------------------------------------------------------------------
-- 11. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.portal_assets ENABLE ROW LEVEL SECURITY;
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
-- 12. POLICIES: PORTAL ASSETS
-- ----------------------------------------------------------------------------

CREATE POLICY "portal_assets_select_policy"
  ON public.portal_assets FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "portal_assets_admin_policy"
  ON public.portal_assets FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- ----------------------------------------------------------------------------
-- 13. POLICIES: TABELAS EDITORIAIS PRINCIPAIS
-- ----------------------------------------------------------------------------

-- A. chronicle_chapters
CREATE POLICY "chronicle_chapters_select_policy"
  ON public.chronicle_chapters FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "chronicle_chapters_admin_policy"
  ON public.chronicle_chapters FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- B. campaign_sessions
CREATE POLICY "campaign_sessions_select_policy"
  ON public.campaign_sessions FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "campaign_sessions_admin_policy"
  ON public.campaign_sessions FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- C. npcs
CREATE POLICY "npcs_select_policy"
  ON public.npcs FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "npcs_admin_policy"
  ON public.npcs FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- D. locations
CREATE POLICY "locations_select_policy"
  ON public.locations FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "locations_admin_policy"
  ON public.locations FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- E. campaign_documents
CREATE POLICY "campaign_documents_select_policy"
  ON public.campaign_documents FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "campaign_documents_admin_policy"
  ON public.campaign_documents FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- F. soundtrack
CREATE POLICY "soundtrack_select_policy"
  ON public.soundtrack FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      active = true
      AND published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "soundtrack_admin_policy"
  ON public.soundtrack FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- G. library_items
CREATE POLICY "library_items_select_policy"
  ON public.library_items FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (visibility = 'players' AND public.is_chronus_player_or_narrator())
      )
    )
  );

CREATE POLICY "library_items_admin_policy"
  ON public.library_items FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- ----------------------------------------------------------------------------
-- 14. POLICIES: TABELAS DE SEGREDOS (ESTRITAMENTE PRIVADAS — NARRADOR)
-- ----------------------------------------------------------------------------

CREATE POLICY "npc_secrets_narrator_exclusive"
  ON public.npc_secrets FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

CREATE POLICY "location_secrets_narrator_exclusive"
  ON public.location_secrets FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

CREATE POLICY "document_secrets_narrator_exclusive"
  ON public.document_secrets FOR ALL
  USING (public.is_chronus_narrator())
  WITH CHECK (public.is_chronus_narrator());

-- ----------------------------------------------------------------------------
-- 15. POLICIES: JUNCTION TABLES (BLINDAGEM BILATERAL CONTRA VAZAMENTO)
-- ----------------------------------------------------------------------------

-- 1. session_npcs: Só retorna se puder ver a Sessão E o NPC
CREATE POLICY "session_npcs_select_protected"
  ON public.session_npcs FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.campaign_sessions s
        WHERE s.id = session_id
        AND s.published = true
        AND (s.published_at IS NULL OR s.published_at <= now())
        AND (s.visibility = 'public' OR (s.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.npcs n
        WHERE n.id = npc_id
        AND n.published = true
        AND (n.published_at IS NULL OR n.published_at <= now())
        AND (n.visibility = 'public' OR (n.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "session_npcs_admin" ON public.session_npcs FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- 2. session_locations: Só retorna se puder ver a Sessão E o Local
CREATE POLICY "session_locations_select_protected"
  ON public.session_locations FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.campaign_sessions s
        WHERE s.id = session_id
        AND s.published = true
        AND (s.published_at IS NULL OR s.published_at <= now())
        AND (s.visibility = 'public' OR (s.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = location_id
        AND l.published = true
        AND (l.published_at IS NULL OR l.published_at <= now())
        AND (l.visibility = 'public' OR (l.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "session_locations_admin" ON public.session_locations FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- 3. session_documents: Só retorna se puder ver a Sessão E o Documento
CREATE POLICY "session_documents_select_protected"
  ON public.session_documents FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.campaign_sessions s
        WHERE s.id = session_id
        AND s.published = true
        AND (s.published_at IS NULL OR s.published_at <= now())
        AND (s.visibility = 'public' OR (s.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.campaign_documents d
        WHERE d.id = document_id
        AND d.published = true
        AND (d.published_at IS NULL OR d.published_at <= now())
        AND (d.visibility = 'public' OR (d.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "session_documents_admin" ON public.session_documents FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- 4. chapter_npcs: Só retorna se puder ver o Capítulo E o NPC
CREATE POLICY "chapter_npcs_select_protected"
  ON public.chapter_npcs FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.chronicle_chapters c
        WHERE c.id = chapter_id
        AND c.published = true
        AND (c.published_at IS NULL OR c.published_at <= now())
        AND (c.visibility = 'public' OR (c.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.npcs n
        WHERE n.id = npc_id
        AND n.published = true
        AND (n.published_at IS NULL OR n.published_at <= now())
        AND (n.visibility = 'public' OR (n.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "chapter_npcs_admin" ON public.chapter_npcs FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- 5. chapter_locations: Só retorna se puder ver o Capítulo E o Local
CREATE POLICY "chapter_locations_select_protected"
  ON public.chapter_locations FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.chronicle_chapters c
        WHERE c.id = chapter_id
        AND c.published = true
        AND (c.published_at IS NULL OR c.published_at <= now())
        AND (c.visibility = 'public' OR (c.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = location_id
        AND l.published = true
        AND (l.published_at IS NULL OR l.published_at <= now())
        AND (l.visibility = 'public' OR (l.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "chapter_locations_admin" ON public.chapter_locations FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- 6. npc_locations: Só retorna se puder ver o NPC E o Local
CREATE POLICY "npc_locations_select_protected"
  ON public.npc_locations FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.npcs n
        WHERE n.id = npc_id
        AND n.published = true
        AND (n.published_at IS NULL OR n.published_at <= now())
        AND (n.visibility = 'public' OR (n.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = location_id
        AND l.published = true
        AND (l.published_at IS NULL OR l.published_at <= now())
        AND (l.visibility = 'public' OR (l.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "npc_locations_admin" ON public.npc_locations FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- 7. npc_documents: Só retorna se puder ver o NPC E o Documento
CREATE POLICY "npc_documents_select_protected"
  ON public.npc_documents FOR SELECT
  USING (
    public.is_chronus_narrator()
    OR (
      EXISTS (
        SELECT 1 FROM public.npcs n
        WHERE n.id = npc_id
        AND n.published = true
        AND (n.published_at IS NULL OR n.published_at <= now())
        AND (n.visibility = 'public' OR (n.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
      AND
      EXISTS (
        SELECT 1 FROM public.campaign_documents d
        WHERE d.id = document_id
        AND d.published = true
        AND (d.published_at IS NULL OR d.published_at <= now())
        AND (d.visibility = 'public' OR (d.visibility = 'players' AND public.is_chronus_player_or_narrator()))
      )
    )
  );

CREATE POLICY "npc_documents_admin" ON public.npc_documents FOR ALL
  USING (public.is_chronus_narrator()) WITH CHECK (public.is_chronus_narrator());

-- ----------------------------------------------------------------------------
-- 16. BUCKETS DE STORAGE & POLICIES AUDITADAS POR portal_assets
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('campaign-images', 'campaign-images', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('maps', 'maps', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('documents', 'documents', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('library', 'library', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- C. SELECT storage.objects (Validação Server-Side contra portal_assets)
CREATE POLICY "campaign_storage_read_policy"
  ON storage.objects FOR SELECT
  USING (
    bucket_id IN ('campaign-images', 'maps', 'documents', 'library')
    AND (
      public.is_chronus_narrator()
      OR EXISTS (
        SELECT 1 FROM public.portal_assets a
        WHERE a.bucket_id = storage.objects.bucket_id
          AND a.object_path = storage.objects.name
          AND a.published = true
          AND (a.published_at IS NULL OR a.published_at <= now())
          AND (
            a.visibility = 'public'
            OR (a.visibility = 'players' AND public.is_chronus_player_or_narrator())
          )
      )
    )
  );

-- D. INSERT storage.objects (Exclusivo Narrador)
CREATE POLICY "campaign_storage_insert_policy"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('campaign-images', 'maps', 'documents', 'library')
    AND public.is_chronus_narrator()
  );

-- E. UPDATE storage.objects (USING + WITH CHECK rigorosos)
CREATE POLICY "campaign_storage_update_policy"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id IN ('campaign-images', 'maps', 'documents', 'library')
    AND public.is_chronus_narrator()
  )
  WITH CHECK (
    bucket_id IN ('campaign-images', 'maps', 'documents', 'library')
    AND public.is_chronus_narrator()
  );

-- F. DELETE storage.objects (Exclusivo Narrador)
CREATE POLICY "campaign_storage_delete_policy"
  ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('campaign-images', 'maps', 'documents', 'library')
    AND public.is_chronus_narrator()
  );
