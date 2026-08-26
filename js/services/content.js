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
   * @returns {Promise<Array<Object>>} Lista de sessões ou array vazio
   */
  async function getSessions(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit, 50);

    const { data, error } = await client
      .from('campaign_sessions')
      .select('id, session_number, title, slug, session_date, in_game_date, summary, events_log, clues_uncovered, status, cover_image_path, visibility, sort_order, published, published_at')
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
    getNpcs,
    getLocations,
    getDocuments,
    getSoundtrack,
    getLibraryItems
  };
})();
