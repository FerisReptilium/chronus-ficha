/**
 * CHRONUS v1.1 — Scheduled Publication Service
 * Usa o published_at já existente como instante de liberação. As políticas RLS
 * já exigem published=true e published_at<=now(), portanto a publicação acontece
 * no servidor sem cron e sem depender do navegador permanecer aberto.
 */
window.ChronusScheduleV11 = (function() {
  'use strict';

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CONFIG = Object.freeze({
    chapter: Object.freeze({ table: 'chronicle_chapters', contentType: 'chapter' }),
    session: Object.freeze({ table: 'campaign_sessions', contentType: 'session' }),
    npc: Object.freeze({ table: 'npcs', contentType: 'npc' }),
    location: Object.freeze({ table: 'locations', contentType: 'location' }),
    document: Object.freeze({ table: 'campaign_documents', contentType: 'document' }),
    library: Object.freeze({ table: 'library_items', contentType: 'library' }),
    soundtrack: Object.freeze({ table: 'soundtrack', contentType: null })
  });

  function fail(code, message) { return { ok: false, code, message }; }
  function success(data) { return { ok: true, data }; }
  function validUUID(value) { return typeof value === 'string' && UUID_REGEX.test(value.trim()); }
  function isNarrator() { return window.ChronusAuth?.getProfile?.()?.role === 'narrator'; }
  function client() { return window.ChronusSupabase?.getClient?.() || null; }

  function dbError(error) {
    if (error?.code === '42501') return fail('RLS_DENIED', 'Agendamento bloqueado pelas regras de segurança do servidor.');
    return fail('DATABASE_ERROR', error?.message || 'Falha ao atualizar o agendamento.');
  }

  function validateFutureInstant(value) {
    if (typeof value !== 'string' || !value.trim()) return fail('INVALID_DATE', 'Informe data e hora para publicação.');
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return fail('INVALID_DATE', 'Data/hora de publicação inválida.');
    if (ms <= Date.now() + 30000) return fail('INVALID_DATE', 'O agendamento precisa estar no futuro.');
    return { ok: true, iso: new Date(ms).toISOString() };
  }

  async function updateParentAndAssets(entity, id, nextState) {
    if (!isNarrator()) return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador.');
    if (!validUUID(id)) return fail('INVALID_ID', 'UUID do registro inválido.');
    const cfg = CONFIG[entity];
    if (!cfg) return fail('INVALID_ENTITY', 'Entidade editorial inválida.');
    const db = client();
    if (!db) return fail('CLIENT_UNAVAILABLE', 'Cliente Supabase indisponível.');
    const cleanId = id.trim();

    let previous;
    try {
      const { data, error } = await db.from(cfg.table)
        .select('id,published,published_at')
        .eq('id', cleanId)
        .single();
      if (error || !data) return error ? dbError(error) : fail('NOT_FOUND', 'Registro não encontrado.');
      previous = data;
    } catch (error) {
      return dbError(error);
    }

    let updated;
    try {
      const { data, error } = await db.from(cfg.table)
        .update(nextState)
        .eq('id', cleanId)
        .select()
        .single();
      if (error) return dbError(error);
      updated = data;
    } catch (error) {
      return dbError(error);
    }

    if (cfg.contentType) {
      try {
        const { error } = await db.from('portal_assets')
          .update(nextState)
          .match({ content_type: cfg.contentType, content_id: cleanId });
        if (error) {
          const { error: rollbackError } = await db.from(cfg.table)
            .update({ published: previous.published, published_at: previous.published_at })
            .eq('id', cleanId);
          if (rollbackError) return fail('PARTIAL_FAILURE', 'Falha no catálogo de assets e também no rollback do conteúdo.');
          return fail('DATABASE_ERROR', 'Falha ao sincronizar assets; o agendamento foi revertido.');
        }
      } catch (error) {
        try {
          await db.from(cfg.table)
            .update({ published: previous.published, published_at: previous.published_at })
            .eq('id', cleanId);
        } catch (_) {}
        return dbError(error);
      }
    }

    return success(updated);
  }

  async function schedulePublication(entity, id, publishAt) {
    const check = validateFutureInstant(publishAt);
    if (!check.ok) return check;
    const result = await updateParentAndAssets(entity, id, {
      published: true,
      published_at: check.iso
    });
    if (!result.ok) return result;
    return success({ ...result.data, scheduled: true, scheduled_for: check.iso });
  }

  async function cancelSchedule(entity, id) {
    const result = await updateParentAndAssets(entity, id, {
      published: false,
      published_at: null
    });
    if (!result.ok) return result;
    return success({ ...result.data, scheduled: false, scheduled_for: null });
  }

  return Object.freeze({ schedulePublication, cancelSchedule, config: CONFIG });
})();
