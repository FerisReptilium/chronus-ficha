/**
 * CHRONUS — Supabase Client Service
 * Singleton do cliente Supabase para consultas e autenticação
 */
window.ChronusSupabase = (function() {
  let client = null;

  function init() {
    if (client) return client;
    const cfg = window.CHRONUS_CONFIG;
    if (!window.supabase || !window.supabase.createClient) {
      console.warn('CHRONUS: SDK @supabase/supabase-js não carregada');
      return null;
    }
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  return {
    getClient: () => client || init(),
    init
  };
})();
