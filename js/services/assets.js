/**
 * CHRONUS — Assets Read-Only Service
 * Camada centralizada para geração segura de signed URLs de assets editoriais privados do Supabase Storage.
 * 
 * DIRETRIZES DE ARQUITETURA & SEGURANÇA:
 * 1. Singleton global encapsulado em IIFE, exposto como window.ChronusAssets.
 * 2. Obtém o cliente Supabase dinamicamente via ChronusSupabase.getClient().
 * 3. Allowlist estrita de buckets editoriais ('campaign-images', 'maps', 'documents', 'library').
 * 4. Validação rigorosa de paths para evitar transversão, URLs absolutas e injeção.
 * 5. Isolamento estrito de cache por Auth Epoch, Bucket, Path e TTL normalizado.
 * 6. Cache em memória temporário com margem de segurança proporcional para renovação.
 * 7. Deduplicação de requisições simultâneas via Promises em voo (inFlight) com guarda de troca de auth.
 * 8. Modelo Default-Deny: qualquer erro ou recusa do Storage retorna null de forma segura.
 */
window.ChronusAssets = (function() {
  'use strict';

  const ALLOWED_BUCKETS = new Set([
    'campaign-images',
    'maps',
    'documents',
    'library'
  ]);

  const DEFAULT_EXPIRES_IN = 3600;
  const MIN_EXPIRES_IN = 60;
  const MAX_EXPIRES_IN = 86400;

  // Epoch de autenticação para isolamento e invalidação atômica de cache
  let authEpoch = 0;

  // Cache em memória: Map<string, { url: string, expiresAt: number }>
  const memoryCache = new Map();

  // Deduplicação de requisições em voo: Map<string, Promise<string|null>>
  const inFlightRequests = new Map();

  // Registrar listener síncrono para invalidação de cache em mudança de autenticação
  if (typeof window !== 'undefined') {
    window.ChronusAuth?.onAuthChange?.(() => {
      authEpoch++;
      memoryCache.clear();
      inFlightRequests.clear();
    });
  }

  /**
   * Valida se o bucket pertence à allowlist editorial.
   * @private
   * @param {string} bucket
   * @returns {boolean}
   */
  function isValidBucket(bucket) {
    if (typeof bucket !== 'string') return false;
    return ALLOWED_BUCKETS.has(bucket.trim());
  }

  /**
   * Sanitiza e valida o caminho do asset dentro do bucket.
   * @private
   * @param {string} path
   * @returns {string|null} Caminho trimado ou null se inválido
   */
  function sanitizePath(path) {
    if (typeof path !== 'string') return null;
    const trimmed = path.trim();
    if (!trimmed) return null;

    // Rejeitar caminhos absolutos, URLs completas (case-insensitive) ou caracteres de transversão
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return null;
    if (trimmed.includes('\\')) return null;
    if (/^https?:\/\//i.test(trimmed)) return null;

    // Rejeitar segmentos '..' ou transversão
    const segments = trimmed.split('/');
    for (const segment of segments) {
      if (segment === '..' || segment === '.') return null;
    }

    return trimmed;
  }

  /**
   * Normaliza e aplica clamp no TTL de expiração.
   * @private
   * @param {*} expiresIn
   * @returns {number}
   */
  function sanitizeExpiresIn(expiresIn) {
    if (!Number.isInteger(expiresIn)) {
      return DEFAULT_EXPIRES_IN;
    }
    return Math.max(MIN_EXPIRES_IN, Math.min(MAX_EXPIRES_IN, expiresIn));
  }

  /**
   * Gera uma signed URL segura para um asset editorial privado.
   * @param {string} bucket - Nome do bucket ('campaign-images', 'maps', 'documents', 'library')
   * @param {string} path - Caminho relativo do arquivo dentro do bucket
   * @param {Object} [options]
   * @param {number} [options.expiresIn=3600] - Tempo de vida da URL em segundos (60-86400)
   * @returns {Promise<string|null>} Signed URL ou null em caso de erro / recusa
   */
  async function getSignedUrl(bucket, path, options = {}) {
    if (!isValidBucket(bucket)) return null;

    const cleanPath = sanitizePath(path);
    if (!cleanPath) return null;

    const cleanBucket = bucket.trim();
    const expiresIn = sanitizeExpiresIn(options?.expiresIn);
    const requestAuthEpoch = authEpoch;
    const cacheKey = `${requestAuthEpoch}:${cleanBucket}:${cleanPath}:${expiresIn}`;

    // 1. Verificar Cache em Memória
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      const safetyMarginSeconds = Math.min(300, Math.max(10, Math.floor(expiresIn * 0.1)));
      const now = Date.now();
      if (now < cached.expiresAt - (safetyMarginSeconds * 1000)) {
        return cached.url;
      }
    }

    // 2. Verificar Deduplicação em Voo
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    // 3. Executar Requisição de Assinatura
    let fetchPromise;
    fetchPromise = (async () => {
      await Promise.resolve(); // Garante que a atribuição de fetchPromise e inFlightRequests ocorra antes do corpo
      try {
        const client = window.ChronusSupabase?.getClient();
        if (!client || !client.storage) {
          console.error('CHRONUS [AssetService]: Cliente Supabase Storage não disponível.');
          return null;
        }

        const { data, error } = await client.storage
          .from(cleanBucket)
          .createSignedUrl(cleanPath, expiresIn);

        // Guarda pós-resposta: se o contexto de autenticação mudou durante a requisição, descartar
        if (requestAuthEpoch !== authEpoch) {
          return null;
        }

        if (error) {
          console.error('CHRONUS [AssetService]: Erro ao gerar signed URL para bucket', cleanBucket, 'código:', error.status || error.name || 'STORAGE_ERROR');
          return null;
        }

        if (!data?.signedUrl) {
          return null;
        }

        // Armazenar no Cache em Memória
        memoryCache.set(cacheKey, {
          url: data.signedUrl,
          expiresAt: Date.now() + (expiresIn * 1000)
        });

        return data.signedUrl;
      } catch (err) {
        console.error('CHRONUS [AssetService]: Exceção inesperada ao assinar asset para bucket', cleanBucket);
        return null;
      } finally {
        if (inFlightRequests.get(cacheKey) === fetchPromise) {
          inFlightRequests.delete(cacheKey);
        }
      }
    })();

    inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Gera signed URLs em lote para múltiplos caminhos dentro do mesmo bucket.
   * @param {string} bucket - Nome do bucket ('campaign-images', 'maps', 'documents', 'library')
   * @param {Array<string>} paths - Lista de caminhos relativos
   * @param {Object} [options]
   * @param {number} [options.expiresIn=3600]
   * @returns {Promise<Map<string, string|null>>} Map indexado pelo path original
   */
  async function getSignedUrls(bucket, paths, options = {}) {
    const resultMap = new Map();
    if (!Array.isArray(paths) || paths.length === 0) {
      return resultMap;
    }

    // Se o bucket for inválido, mapeia todos para null
    if (!isValidBucket(bucket)) {
      for (const p of paths) {
        if (typeof p === 'string') {
          resultMap.set(p.trim(), null);
        }
      }
      return resultMap;
    }

    // Processar individualmente preservando deduplicação e cache
    const uniquePaths = Array.from(new Set(paths.map(p => typeof p === 'string' ? p.trim() : '')));
    
    await Promise.all(uniquePaths.map(async (p) => {
      if (!p) return;
      const url = await getSignedUrl(bucket, p, options);
      resultMap.set(p, url);
    }));

    // Garantir que todos os paths da entrada original tenham entrada no Map
    for (const p of paths) {
      if (typeof p === 'string') {
        const trimmed = p.trim();
        if (!resultMap.has(trimmed)) {
          resultMap.set(trimmed, null);
        }
      }
    }

    return resultMap;
  }

  return {
    getSignedUrl,
    getSignedUrls
  };
})();
