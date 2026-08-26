/**
 * CHRONUS v1.1 — Narrator Secrets Service
 * CRUD 1:1 dos segredos editoriais, sempre exclusivo do Narrador.
 * RLS do Supabase permanece a autoridade real.
 */
window.ChronusSecretsV11 = (function() {
  'use strict';

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const CONFIG = Object.freeze({
    chapter: Object.freeze({
      table: 'chapter_secrets',
      key: 'chapter_id',
      fields: Object.freeze(['narrator_notes', 'hidden_truth', 'future_reveals'])
    }),
    session: Object.freeze({
      table: 'session_secrets',
      key: 'session_id',
      fields: Object.freeze(['narrator_notes', 'hidden_events', 'consequences', 'future_hooks'])
    }),
    npc: Object.freeze({
      table: 'npc_secrets',
      key: 'npc_id',
      fields: Object.freeze(['true_identity', 'true_faction', 'agenda', 'secrets', 'narrator_notes', 'hidden_status'])
    }),
    location: Object.freeze({
      table: 'location_secrets',
      key: 'location_id',
      fields: Object.freeze(['narrator_notes', 'hidden_features', 'supernatural_truth'])
    }),
    document: Object.freeze({
      table: 'document_secrets',
      key: 'document_id',
      fields: Object.freeze(['narrator_notes', 'hidden_meaning', 'solution_translation'])
    })
  });

  function fail(code, message) { return { ok: false, code, message }; }
  function success(data) { return { ok: true, data }; }

  function narratorGuard() {
    return window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function client() {
    return window.ChronusSupabase?.getClient?.() || null;
  }

  function validUUID(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
  }

  function normalizePayload(entity, raw) {
    const cfg = CONFIG[entity];
    if (!cfg) return fail('INVALID_ENTITY', 'Entidade sem suporte a segredos.');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fail('INVALID_INPUT', 'Dados de segredos inválidos.');
    }

    const result = {};
    for (const key of Object.keys(raw)) {
      if (!cfg.fields.includes(key)) {
        return fail('INVALID_FIELD', `Campo de segredo não permitido: ${key}.`);
      }
      const value = raw[key];
      if (value === null || value === undefined || value === '') {
        result[key] = null;
      } else if (typeof value === 'string') {
        result[key] = value.trim() || null;
      } else {
        return fail('INVALID_INPUT', `O campo ${key} deve ser texto.`);
      }
    }
    return { ok: true, data: result };
  }

  function dbError(error) {
    if (error?.code === '42501') return fail('RLS_DENIED', 'Acesso bloqueado pelas regras de segurança do servidor.');
    return fail('DATABASE_ERROR', error?.message || 'Falha ao acessar segredos editoriais.');
  }

  async function getSecret(entity, parentId) {
    if (!narratorGuard()) return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador.');
    if (!validUUID(parentId)) return fail('INVALID_ID', 'UUID do registro inválido.');
    const cfg = CONFIG[entity];
    if (!cfg) return fail('INVALID_ENTITY', 'Entidade sem suporte a segredos.');
    const db = client();
    if (!db) return fail('CLIENT_UNAVAILABLE', 'Cliente Supabase indisponível.');

    try {
      const { data, error } = await db
        .from(cfg.table)
        .select([cfg.key, ...cfg.fields].join(','))
        .eq(cfg.key, parentId.trim())
        .maybeSingle();
      if (error) return dbError(error);
      return success(data || null);
    } catch (error) {
      return dbError(error);
    }
  }

  async function saveSecret(entity, parentId, rawData) {
    if (!narratorGuard()) return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador.');
    if (!validUUID(parentId)) return fail('INVALID_ID', 'UUID do registro inválido.');
    const cfg = CONFIG[entity];
    if (!cfg) return fail('INVALID_ENTITY', 'Entidade sem suporte a segredos.');
    const normalized = normalizePayload(entity, rawData);
    if (!normalized.ok) return normalized;
    const db = client();
    if (!db) return fail('CLIENT_UNAVAILABLE', 'Cliente Supabase indisponível.');

    const payload = { [cfg.key]: parentId.trim(), ...normalized.data };
    try {
      const { data, error } = await db
        .from(cfg.table)
        .upsert(payload, { onConflict: cfg.key })
        .select()
        .single();
      if (error) return dbError(error);
      return success(data);
    } catch (error) {
      return dbError(error);
    }
  }

  async function clearSecret(entity, parentId) {
    if (!narratorGuard()) return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador.');
    if (!validUUID(parentId)) return fail('INVALID_ID', 'UUID do registro inválido.');
    const cfg = CONFIG[entity];
    if (!cfg) return fail('INVALID_ENTITY', 'Entidade sem suporte a segredos.');
    const db = client();
    if (!db) return fail('CLIENT_UNAVAILABLE', 'Cliente Supabase indisponível.');

    try {
      const { error } = await db.from(cfg.table).delete().eq(cfg.key, parentId.trim());
      if (error) return dbError(error);
      return success({ deleted: true });
    } catch (error) {
      return dbError(error);
    }
  }

  return Object.freeze({ getSecret, saveSecret, clearSecret, config: CONFIG });
})();
