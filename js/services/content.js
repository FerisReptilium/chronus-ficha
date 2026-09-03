/**
 * CHRONUS — Content Read-Only Service
 * Camada unificada para consulta e recuperação de conteúdo editorial do Supabase.
 * 
 * DIRETRIZES DE ARQUITETURA & SEGURANÇA:
 * 1. Singleton global encapsulado em IIFE, exposto como window.ChronusContent.
 * 2. Obtém o cliente Supabase dinamicamente a cada requisição via ChronusSupabase.getClient().
 * 3. Não aplica filtros de 'published', 'visibility' ou 'active' no frontend: a autoridade
 *    de acesso e governança editorial é estritamente o Row Level Security (RLS) do Supabase.
 * 4. Trata erros com transparência e propaga exceções de forma clara sem omitir causas.
 */
window.ChronusContent = (function() {
  'use strict';

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SESSION_STATUSES = Object.freeze(['planned', 'in_progress', 'completed', 'canceled']);
  const SESSION_COLUMNS = [
    'id', 'session_number', 'title', 'slug', 'session_date', 'in_game_date',
    'summary', 'current_objective', 'events_log', 'clues_uncovered', 'status',
    'cover_image_path', 'visibility', 'sort_order', 'published', 'published_at'
  ].join(', ');

  /**
   * Obtém a instância ativa do cliente Supabase.
   * @private
   * @returns {Object} Supabase client
   */
  function getClient() {
    const client = window.ChronusSupabase?.getClient();
    if (!client) {
      throw new Error('CHRONUS: Cliente Supabase não inicializado.');
    }
    return client;
  }

  /**
   * Normaliza e limita o parâmetro limit entre 1 e 100.
   * @private
   * @param {number|undefined} limit
   * @param {number} [defaultLimit=50]
   * @returns {number}
   */
  function sanitizeLimit(limit, defaultLimit = 50) {
    const num = Number(limit);
    if (Number.isFinite(num)) {
      return Math.max(1, Math.min(100, Math.floor(num)));
    }
    return defaultLimit;
  }

  function sanitizeSessionStatuses(statuses) {
    if (!Array.isArray(statuses)) return [];
    return [...new Set(statuses.filter(status => SESSION_STATUSES.includes(status)))];
  }

  function compareSessionNumber(a, b, descending = false) {
    const left = Number(a?.session_number);
    const right = Number(b?.session_number);
    const safeLeft = Number.isFinite(left) ? left : 0;
    const safeRight = Number.isFinite(right) ? right : 0;
    return descending ? safeRight - safeLeft : safeLeft - safeRight;
  }

  function compareSessionDate(a, b, descending = false) {
    const left = typeof a?.session_date === 'string' ? Date.parse(`${a.session_date}T00:00:00Z`) : NaN;
    const right = typeof b?.session_date === 'string' ? Date.parse(`${b.session_date}T00:00:00Z`) : NaN;
    const leftValid = Number.isFinite(left);
    const rightValid = Number.isFinite(right);

    if (leftValid && rightValid && left !== right) return descending ? right - left : left - right;
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    return compareSessionNumber(a, b, descending);
  }

  function normalizeEmbeddedRelation(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value && typeof value === 'object' ? value : null;
  }

  /**
   * Consulta a lista de capítulos da crônica.
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de capítulos ou array vazio
   */
  async function getChapters(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);

    const { data, error } = await client
      .from('chronicle_chapters')
      .select('id, chapter_number, title, subtitle, slug, summary, content, cover_image_path, visibility, sort_order, published, published_at')
      .order('sort_order', { ascending: true })
      .order('chapter_number', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar capítulos:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Consulta o diário de sessões da campanha.
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @param {Array<string>} [options.statuses] - Filtro opcional por status permitido
   * @returns {Promise<Array<Object>>} Lista de sessões ou array vazio
   */
  async function getSessions(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);
    const statuses = sanitizeSessionStatuses(options.statuses);

    let query = client
      .from('campaign_sessions')
      .select(SESSION_COLUMNS);

    if (statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('session_number', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar sessões:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Retorna os NPCs, locais e documentos que o RLS permite consultar para uma
   * sessão. Os joins usam as foreign keys existentes e nunca contornam RLS.
   * @param {string} sessionId UUID da sessão
   * @param {Object} [options]
   * @param {number} [options.limit=6]
   * @returns {Promise<{npcs:Array<Object>,locations:Array<Object>,documents:Array<Object>}>}
   */
  async function getSessionRelations(sessionId, options = {}) {
    if (typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId.trim())) {
      throw new Error('CHRONUS: UUID de sessão inválido para consulta de relações.');
    }

    const client = getClient();
    const cleanSessionId = sessionId.trim();
    const limit = sanitizeLimit(options.limit, 6);

    const [npcResult, locationResult, documentResult] = await Promise.all([
      client
        .from('session_npcs')
        .select('role_in_session, npc:npcs!session_npcs_npc_id_fkey(id, name, slug, role_occupation, status)')
        .eq('session_id', cleanSessionId)
        .limit(limit),
      client
        .from('session_locations')
        .select('notes, location:locations!session_locations_location_id_fkey(id, name, slug, type, district_region)')
        .eq('session_id', cleanSessionId)
        .limit(limit),
      client
        .from('session_documents')
        .select('discovery_context, document:campaign_documents!session_documents_document_id_fkey(id, title, slug, type)')
        .eq('session_id', cleanSessionId)
        .limit(limit)
    ]);

    const failed = [npcResult, locationResult, documentResult].find(result => result.error);
    if (failed) {
      console.error('CHRONUS [ContentService]: Falha ao buscar relações da sessão:', failed.error);
      throw failed.error;
    }

    const npcs = (npcResult.data || []).map(row => {
      const npc = normalizeEmbeddedRelation(row.npc);
      return npc ? { ...npc, relation_note: row.role_in_session || null } : null;
    }).filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

    const locations = (locationResult.data || []).map(row => {
      const location = normalizeEmbeddedRelation(row.location);
      return location ? { ...location, relation_note: row.notes || null } : null;
    }).filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

    const documents = (documentResult.data || []).map(row => {
      const document = normalizeEmbeddedRelation(row.document);
      return document ? { ...document, relation_note: row.discovery_context || null } : null;
    }).filter(Boolean).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR'));

    return { npcs, locations, documents };
  }

  /**
   * Monta o briefing da Área do Jogador a partir de registros já autorizados
   * pelo RLS: missão atual, próxima sessão, último resumo e relações da missão.
   */
  async function getPlayerBriefing() {
    const sessions = await getSessions({
      limit: 100,
      statuses: ['in_progress', 'planned', 'completed']
    });

    const inProgress = sessions
      .filter(session => session.status === 'in_progress')
      .sort((a, b) => compareSessionNumber(a, b, true))[0] || null;
    const nextSession = sessions
      .filter(session => session.status === 'planned')
      .sort((a, b) => compareSessionDate(a, b, false))[0] || null;
    const lastSession = sessions
      .filter(session => session.status === 'completed')
      .sort((a, b) => compareSessionDate(a, b, true))[0] || null;
    const activeSession = inProgress || nextSession;
    const relationSession = activeSession || lastSession;
    const relations = relationSession
      ? await getSessionRelations(relationSession.id, { limit: 6 })
      : { npcs: [], locations: [], documents: [] };

    return {
      activeSession,
      nextSession,
      lastSession,
      relationSession,
      relations
    };
  }

  /**
   * Consulta o dossiê de NPCs da crônica.
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de NPCs ou array vazio
   */
  async function getNpcs(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);

    const { data, error } = await client
      .from('npcs')
      .select('id, name, slug, portrait_path, role_occupation, faction, apparent_age, public_description, known_personality, status, relationship_to_group, first_appearance_session_id, last_appearance_session_id, visibility, sort_order, published, published_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar NPCs:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Consulta o atlas de locais e mapas da crônica.
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de locais ou array vazio
   */
  async function getLocations(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);

    const { data, error } = await client
      .from('locations')
      .select('id, name, slug, type, district_region, narrative_address, public_description, image_path, map_image_path, parent_location_id, visibility, sort_order, published, published_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar locais:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Consulta os documentos e evidências materiais da campanha.
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de documentos ou array vazio
   */
  async function getDocuments(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);

    const { data, error } = await client
      .from('campaign_documents')
      .select('id, title, slug, type, narrative_date, public_description, transcription, image_path, file_path, found_in_session_id, visibility, sort_order, published, published_at')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar documentos:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Consulta a trilha sonora da crônica.
   * @param {Object} [options]
   * @param {number} [options.limit=100] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de trilhas sonoras ou array vazio
   */
  async function getSoundtrack(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 100);

    const { data, error } = await client
      .from('soundtrack')
      .select('id, title, youtube_url, category, description, visibility, sort_order, active, published, published_at')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar trilha sonora:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Consulta os itens e manuais da biblioteca oficial.
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de itens da biblioteca ou array vazio
   */
  async function getLibraryItems(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);

    const { data, error } = await client
      .from('library_items')
      .select('id, title, slug, category, version, description, cover_path, file_path, file_size_bytes, page_count, visibility, sort_order, published, published_at')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar biblioteca:', error);
      throw error;
    }

    return data || [];
  }

  return {
    getChapters,
    getSessions,
    getSessionRelations,
    getPlayerBriefing,
    getNpcs,
    getLocations,
    getDocuments,
    getSoundtrack,
    getLibraryItems
  };
})();
