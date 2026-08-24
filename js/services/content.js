/**
 * CHRONUS — Content Read-Only Service
 * Camada unificada para consulta e recuperação de conteúdo editorial do Supabase.
 * 
 * DIRETRIZES DE ARQUITETURA & SEGURANÇA:
 * 1. Singleton global encapsulado em IIFE, exposto como window.ChronusContent.
 * 2. Obtém o cliente Supabase dinamicamente a cada requisição via ChronusSupabase.getClient().
 * 3. Não aplica filtros de 'published' ou 'visibility' no frontend: a autoridade de acesso
 *    e governança editorial é estritamente o Row Level Security (RLS) do Supabase.
 * 4. Trata erros com transparência e propaga exceções de forma clara.
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
   * Normaliza e limita o parâmetro limit entre 1 e 100 (padrão: 50).
   * @private
   * @param {number|undefined} limit
   * @returns {number}
   */
  function sanitizeLimit(limit) {
    const num = Number(limit);
    if (Number.isFinite(num)) {
      return Math.max(1, Math.min(100, Math.floor(num)));
    }
    return 50;
  }

  /**
   * Consulta a lista de capítulos da crônica.
   * A visibilidade (public/players/narrator) e o estado de publicação (published/draft)
   * são integralmente filtrados pelo PostgreSQL via RLS.
   * 
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de capítulos ou array vazio
   */
  async function getChapters(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit);

    const { data, error } = await client
      .from('chronicle_chapters')
      .select('id, chapter_number, title, subtitle, slug, summary, cover_image_path, sort_order, published_at')
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
   * A visibilidade e o estado de publicação são integralmente filtrados pelo PostgreSQL via RLS.
   * 
   * @param {Object} [options]
   * @param {number} [options.limit=50] - Quantidade máxima de registros (1-100)
   * @returns {Promise<Array<Object>>} Lista de sessões ou array vazio
   */
  async function getSessions(options = {}) {
    const client = getClient();
    const limit = sanitizeLimit(options.limit);

    const { data, error } = await client
      .from('campaign_sessions')
      .select('id, session_number, title, slug, session_date, in_game_date, summary, status, cover_image_path, sort_order, published_at')
      .order('sort_order', { ascending: true })
      .order('session_number', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('CHRONUS [ContentService]: Falha ao buscar sessões:', error);
      throw error;
    }

    return data || [];
  }

  return {
    getChapters,
    getSessions
  };
})();
