-- ============================================================================
-- CHRONUS v1.1 — SECURITY HARDENING
-- Additive / compatible with v1.0 production schema.
--
-- Goals:
-- 1. Trigger/event-trigger helpers must not be callable as public RPCs.
-- 2. Storage buckets must enforce the same no-SVG rule as the client service.
-- 3. Cover portal_assets.created_by FK with an index.
--
-- Intentionally unchanged:
-- - can_read_portal_asset(), is_chronus_narrator() and
--   is_chronus_player_or_narrator() remain executable by API roles because
--   existing RLS/storage policies invoke them under those roles.
-- ============================================================================

BEGIN;

-- Trigger-only helpers do not need direct API execution privileges.
REVOKE ALL ON FUNCTION public.handle_chronus_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_chronus_updated_at() FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_chronus_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_chronus_user() FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, service_role;

-- Defense in depth: the v1 service already rejects SVG, but Storage must reject
-- it as well so a direct SDK/API call cannot bypass the client-side allowlist.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('campaign-images', 'maps');

-- Cover FK used for ownership/audit joins and remove the linter warning.
CREATE INDEX IF NOT EXISTS idx_portal_assets_created_by
  ON public.portal_assets(created_by);

COMMIT;
