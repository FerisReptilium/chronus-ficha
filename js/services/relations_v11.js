/**
 * CHRONUS v1.1 — Editorial Relations Service
 * Gerencia junction tables tipadas com allowlists fechadas e RLS do servidor.
 */
window.ChronusRelationsV11 = (function() {
  'use strict';

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const CONFIG = Object.freeze({
    session_npcs: Object.freeze({ table: 'session_npcs', ownerKey: 'session_id', targetKey: 'npc_id', targetEntity: 'npc', metadata: 'role_in_session' }),
    session_locations: Object.freeze({ table: 'session_locations', ownerKey: 'session_id', targetKey: 'location_id', targetEntity: 'location', metadata: 'notes' }),
    session_documents: Object.freeze({ table: 'session_documents', ownerKey: 'session_id', targetKey: 'document_id', targetEntity: 'document', metadata: 'discovery_context' }),
    chapter_npcs: Object.freeze({ table: 'chapter_npcs', ownerKey: 'chapter_id', targetKey: 'npc_id', targetEntity: 'npc', metadata: null }),
    chapter_locations: Object.freeze({ table: 'chapter_locations', ownerKey: 'chapter_id', targetKey: 'location_id', targetEntity: 'location', metadata: null }),
    npc_locations: Object.freeze({ table: 'npc_locations', ownerKey: 'npc_id', targetKey: 'location_id', targetEntity: 'location', metadata: 'association_type' }),
    npc_documents: Object.freeze({ table: 'npc_documents', ownerKey: 'npc_id', targetKey: 'document_id', targetEntity: 'document', metadata: 'association_type' })
  });

  function fail(code, message) { return { ok: false, code, message }; }
  function success(data) { return { ok: true, data }; }
  function validUUID(value) { return typeof value === 'string' && UUID_REGEX.test(value.trim()); }
  function isNarrator() { return window.ChronusAuth?.getProfile?.()?.role === 'narrator'; }
  function db() { return window.ChronusSupabase?.getClient?.() || null; }

  function dbError(error) {
    if (error?.code === '42501') return fail('RLS_DENIED', 'Relação bloqueada pelas regras de segurança do servidor.');
    if (error?.code === '23503') return fail('RELATION_CONFLICT', 'Um dos registros relacionados não existe mais.');
    return fail('DATABASE_ERROR', error?.message || 'Falha ao atualizar relações editoriais.');
  }

  function normalizeRows(cfg, rows) {
    if (!Array.isArray(rows)) return fail('INVALID_INPUT', 'A lista de relações deve ser um array.');
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const targetId = row?.target_id;
      if (!validUUID(targetId)) return fail('INVALID_ID', 'Uma relação contém UUID alvo inválido.');
      const clean = targetId.trim();
      if (seen.has(clean)) continue;
      seen.add(clean);
      const normalized = { target_id: clean };
      if (cfg.metadata) {
        const value = row?.metadata;
        if (value === null || value === undefined || value === '') normalized.metadata = null;
        else if (typeof value === 'string') normalized.metadata = value.trim() || null;
        else return fail('INVALID_INPUT', 'Metadado de relação deve ser texto.');
      }
      out.push(normalized);
    }
    return { ok: true, data: out };
  }

  async function getRelations(relationKey, ownerId) {
    if (!isNarrator()) return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador.');
    if (!validUUID(ownerId)) return fail('INVALID_ID', 'UUID do registro principal inválido.');
    const cfg = CONFIG[relationKey];
    if (!cfg) return fail('INVALID_RELATION', 'Tipo de relação não permitido.');
    const client = db();
    if (!client) return fail('CLIENT_UNAVAILABLE', 'Cliente Supabase indisponível.');

    const columns = [cfg.ownerKey, cfg.targetKey];
    if (cfg.metadata) columns.push(cfg.metadata);
    try {
      const { data, error } = await client.from(cfg.table)
        .select(columns.join(','))
        .eq(cfg.ownerKey, ownerId.trim());
      if (error) return dbError(error);
      return success((data || []).map(row => ({
        target_id: row[cfg.targetKey],
        metadata: cfg.metadata ? (row[cfg.metadata] ?? null) : null
      })));
    } catch (error) {
      return dbError(error);
    }
  }

  async function saveRelations(relationKey, ownerId, rows) {
    if (!isNarrator()) return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador.');
    if (!validUUID(ownerId)) return fail('INVALID_ID', 'UUID do registro principal inválido.');
    const cfg = CONFIG[relationKey];
    if (!cfg) return fail('INVALID_RELATION', 'Tipo de relação não permitido.');
    const normalized = normalizeRows(cfg, rows);
    if (!normalized.ok) return normalized;
    const client = db();
    if (!client) return fail('CLIENT_UNAVAILABLE', 'Cliente Supabase indisponível.');

    const owner = ownerId.trim();
    let existing = [];
    try {
      const current = await getRelations(relationKey, owner);
      if (!current.ok) return current;
      existing = current.data || [];
    } catch (error) {
      return dbError(error);
    }

    const desiredIds = new Set(normalized.data.map(r => r.target_id));
    const removedIds = existing.map(r => r.target_id).filter(id => !desiredIds.has(id));

    if (removedIds.length > 0) {
      try {
        const { error } = await client.from(cfg.table)
          .delete()
          .eq(cfg.ownerKey, owner)
          .in(cfg.targetKey, removedIds);
        if (error) return dbError(error);
      } catch (error) {
        return dbError(error);
      }
    }

    if (normalized.data.length > 0) {
      const payload = normalized.data.map(row => {
        const record = { [cfg.ownerKey]: owner, [cfg.targetKey]: row.target_id };
        if (cfg.metadata) record[cfg.metadata] = row.metadata ?? null;
        return record;
      });
      try {
        const { error } = await client.from(cfg.table)
          .upsert(payload, { onConflict: `${cfg.ownerKey},${cfg.targetKey}` });
        if (error) return dbError(error);
      } catch (error) {
        return dbError(error);
      }
    }

    return success({ relation: relationKey, owner_id: owner, count: normalized.data.length });
  }

  return Object.freeze({ getRelations, saveRelations, config: CONFIG });
})();
