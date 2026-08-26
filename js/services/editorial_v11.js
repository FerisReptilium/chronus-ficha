/**
 * CHRONUS v1.1 — Editorial DELETE Extension
 * Acrescenta exclusão definitiva, auditável e exclusiva do Narrador sem alterar
 * a API estável da v1.0.0.
 *
 * Estratégia:
 * 1. valida Narrador + UUID + confirmação explícita;
 * 2. lê o pai e cataloga todos os assets em portal_assets antes da exclusão;
 * 3. exclui o conteúdo pai (FKs ON DELETE cuidam de secrets/junctions/set-null);
 * 4. remove objetos físicos pela Storage API;
 * 5. remove portal_assets somente após sucesso físico;
 * 6. se a limpeza física falhar, mantém portal_assets como trilha de auditoria
 *    e retorna ASSET_CLEANUP_PENDING.
 */
(function installChronusEditorialV11() {
  'use strict';

  const editorial = window.ChronusEditorial;
  if (!editorial) {
    console.error('CHRONUS v1.1: ChronusEditorial indisponível; extensão DELETE não instalada.');
    return;
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LIBRARY_CATEGORIES = Object.freeze([
    'system_book', 'pocket_manual', 'quick_guide',
    'character_sheet', 'supplement', 'extra'
  ]);
  const LIBRARY_MAX_BYTES = 50 * 1024 * 1024;

  const DELETE_ENTITY_CONFIG = Object.freeze({
    chapter: Object.freeze({ table: 'chronicle_chapters', contentType: 'chapter', label: 'Capítulo da Crônica' }),
    session: Object.freeze({ table: 'campaign_sessions', contentType: 'session', label: 'Sessão de Campanha' }),
    npc: Object.freeze({ table: 'npcs', contentType: 'npc', label: 'NPC' }),
    location: Object.freeze({ table: 'locations', contentType: 'location', label: 'Local' }),
    document: Object.freeze({ table: 'campaign_documents', contentType: 'document', label: 'Documento' }),
    library: Object.freeze({ table: 'library_items', contentType: 'library', label: 'Item da Biblioteca' }),
    soundtrack: Object.freeze({ table: 'soundtrack', contentType: null, label: 'Trilha Sonora' })
  });

  function ok(data, warning) {
    const result = { ok: true, data };
    if (warning) result.warning = warning;
    return result;
  }

  function fail(code, message) {
    return { ok: false, code, message };
  }

  function isNarrator() {
    return window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function isValidUUID(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
  }

  function getClient() {
    return window.ChronusSupabase?.getClient?.() || null;
  }

  function dbFailure(error, fallback) {
    if (error?.code === '42501') {
      return fail('RLS_DENIED', 'A exclusão foi bloqueada pelas regras de segurança do servidor.');
    }
    if (error?.code === '23503') {
      return fail('RELATION_CONFLICT', 'O registro ainda possui uma dependência que impede a exclusão segura.');
    }
    return fail('DATABASE_ERROR', error?.message || fallback || 'Falha no banco de dados.');
  }

  function generateSecureUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
    return null;
  }

  function sanitizeLibraryMetadata(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fail('INVALID_INPUT', 'Os metadados da Biblioteca são obrigatórios.');
    }

    const allowed = new Set([
      'title', 'slug', 'category', 'version', 'description', 'page_count', 'sort_order'
    ]);
    for (const key of Object.keys(raw)) {
      if (!allowed.has(key)) {
        return fail('INVALID_FIELD', `Campo '${key}' não permitido na criação da Biblioteca.`);
      }
    }

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
    const category = typeof raw.category === 'string' ? raw.category.trim() : '';
    const version = typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '1.0';
    const description = typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : null;

    if (!title) return fail('INVALID_INPUT', 'O título do item é obrigatório.');
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return fail('INVALID_INPUT', 'O slug deve conter apenas letras minúsculas, números e hífens.');
    }
    if (!LIBRARY_CATEGORIES.includes(category)) {
      return fail('INVALID_INPUT', 'Categoria de Biblioteca inválida.');
    }

    let pageCount = null;
    if (raw.page_count !== undefined && raw.page_count !== null && raw.page_count !== '') {
      pageCount = Number(raw.page_count);
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        return fail('INVALID_INPUT', 'Número de páginas deve ser um inteiro positivo.');
      }
    }

    let sortOrder = 0;
    if (raw.sort_order !== undefined && raw.sort_order !== null && raw.sort_order !== '') {
      sortOrder = Number(raw.sort_order);
      if (!Number.isInteger(sortOrder)) {
        return fail('INVALID_INPUT', 'Ordem de exibição deve ser um número inteiro.');
      }
    }

    return {
      ok: true,
      data: {
        title,
        slug,
        category,
        version,
        description,
        page_count: pageCount,
        sort_order: sortOrder
      }
    };
  }

  function validateLibraryPdf(file) {
    if (!file || typeof file !== 'object') {
      return fail('INVALID_FILE', 'Selecione um arquivo PDF para a Biblioteca.');
    }
    const size = Number(file.size || 0);
    const mime = String(file.type || '').toLowerCase().trim();
    if (size <= 0) return fail('INVALID_FILE', 'O PDF não pode estar vazio.');
    if (size > LIBRARY_MAX_BYTES) return fail('FILE_TOO_LARGE', 'O PDF excede o limite de 50MB.');
    if (mime !== 'application/pdf') {
      return fail('INVALID_FILE_TYPE', 'A Biblioteca aceita somente arquivos PDF.');
    }
    return { ok: true, size };
  }

  function groupAssetsByBucket(assets) {
    const groups = new Map();
    for (const asset of assets) {
      if (!asset?.id || !asset?.bucket_id || !asset?.object_path) continue;
      if (!groups.has(asset.bucket_id)) groups.set(asset.bucket_id, []);
      groups.get(asset.bucket_id).push(asset);
    }
    return groups;
  }

  async function createLibraryItemWithFile(rawMetadata, file) {
    if (!isNarrator()) {
      return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador autenticado.');
    }

    const metadataCheck = sanitizeLibraryMetadata(rawMetadata);
    if (!metadataCheck.ok) return metadataCheck;

    const fileCheck = validateLibraryPdf(file);
    if (!fileCheck.ok) return fileCheck;

    const client = getClient();
    if (!client) {
      return fail('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');
    }

    const contentId = generateSecureUUID();
    const assetId = generateSecureUUID();
    if (!contentId || !assetId) {
      return fail('SYSTEM_ERROR', 'Não foi possível gerar identificadores seguros para o item.');
    }

    const objectPath = `library/${contentId}/${assetId}.pdf`;
    const user = window.ChronusAuth?.getUser?.();

    try {
      const { error } = await client.storage
        .from('library')
        .upload(objectPath, file, {
          upsert: false,
          contentType: 'application/pdf'
        });

      if (error) {
        return fail('STORAGE_ERROR', error.message || 'Falha ao enviar o PDF para o Storage.');
      }
    } catch (error) {
      return fail('STORAGE_ERROR', error?.message || 'Falha ao enviar o PDF para o Storage.');
    }

    let portalAssetCreated = false;
    try {
      const { error } = await client.from('portal_assets').insert({
        bucket_id: 'library',
        object_path: objectPath,
        content_type: 'library',
        content_id: contentId,
        visibility: 'narrator',
        published: false,
        published_at: null,
        created_by: user?.id || null
      });

      if (error) {
        let storageCleanupOk = false;
        try {
          const { error: cleanupError } = await client.storage.from('library').remove([objectPath]);
          storageCleanupOk = !cleanupError;
        } catch (_) {}

        if (!storageCleanupOk) {
          return {
            ok: false,
            code: 'COMPENSATION_FAILED',
            message: 'Falha ao registrar o PDF e a limpeza automática do arquivo também falhou.',
            cleanup_pending: { bucket_id: 'library', object_path: objectPath }
          };
        }
        return dbFailure(error, 'Falha ao registrar o PDF no catálogo seguro.');
      }
      portalAssetCreated = true;
    } catch (error) {
      try { await client.storage.from('library').remove([objectPath]); } catch (_) {}
      return dbFailure(error, 'Falha ao registrar o PDF no catálogo seguro.');
    }

    const payload = {
      id: contentId,
      ...metadataCheck.data,
      file_path: objectPath,
      file_size_bytes: fileCheck.size,
      visibility: 'narrator',
      published: false,
      published_at: null,
      created_by: user?.id || null
    };

    try {
      const { data, error } = await client
        .from('library_items')
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        return ok(data);
      }

      let storageCleanupOk = false;
      try {
        const { error: storageCleanupError } = await client.storage.from('library').remove([objectPath]);
        storageCleanupOk = !storageCleanupError;
      } catch (_) {}

      let catalogCleanupOk = false;
      if (storageCleanupOk && portalAssetCreated) {
        try {
          const { error: catalogCleanupError } = await client
            .from('portal_assets')
            .delete()
            .match({ bucket_id: 'library', object_path: objectPath });
          catalogCleanupOk = !catalogCleanupError;
        } catch (_) {}
      }

      if (!storageCleanupOk || (portalAssetCreated && !catalogCleanupOk)) {
        return {
          ok: false,
          code: 'COMPENSATION_FAILED',
          message: 'O item não foi criado e existe uma limpeza pendente para o PDF.',
          cleanup_pending: {
            bucket_id: 'library',
            object_path: objectPath,
            storage_removed: storageCleanupOk,
            catalog_removed: catalogCleanupOk
          }
        };
      }

      return dbFailure(error, 'Não foi possível criar o item da Biblioteca.');
    } catch (error) {
      let storageCleanupOk = false;
      try {
        const { error: storageCleanupError } = await client.storage.from('library').remove([objectPath]);
        storageCleanupOk = !storageCleanupError;
      } catch (_) {}

      if (storageCleanupOk && portalAssetCreated) {
        try {
          await client.from('portal_assets').delete()
            .match({ bucket_id: 'library', object_path: objectPath });
        } catch (_) {}
      }

      return dbFailure(error, 'Não foi possível criar o item da Biblioteca.');
    }
  }

  async function deleteContent(entityKey, id, options = {}) {
    if (!isNarrator()) {
      return fail('NOT_NARRATOR', 'Ação exclusiva para o Narrador autenticado.');
    }

    const config = DELETE_ENTITY_CONFIG[entityKey];
    if (!config) {
      return fail('INVALID_ENTITY', `Entidade editorial '${entityKey}' não reconhecida.`);
    }

    if (!isValidUUID(id)) {
      return fail('INVALID_ID', 'Identificador de registro (UUID) inválido.');
    }

    if (options.confirmed !== true) {
      return fail('CONFIRMATION_REQUIRED', 'A exclusão definitiva exige confirmação explícita.');
    }

    const cleanId = id.trim();
    const client = getClient();
    if (!client) {
      return fail('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');
    }

    let parent;
    try {
      const { data, error } = await client
        .from(config.table)
        .select('id')
        .eq('id', cleanId)
        .single();

      if (error || !data) {
        if (error) return dbFailure(error, `${config.label} não encontrado.`);
        return fail('NOT_FOUND', `${config.label} não encontrado.`);
      }
      parent = data;
    } catch (error) {
      return dbFailure(error, `Falha ao localizar ${config.label.toLowerCase()}.`);
    }

    let assets = [];
    if (config.contentType) {
      try {
        const { data, error } = await client
          .from('portal_assets')
          .select('id, bucket_id, object_path')
          .match({ content_type: config.contentType, content_id: cleanId });

        if (error) {
          return dbFailure(error, 'Não foi possível catalogar os assets antes da exclusão.');
        }
        assets = Array.isArray(data) ? data : [];
      } catch (error) {
        return dbFailure(error, 'Não foi possível catalogar os assets antes da exclusão.');
      }
    }

    try {
      const { data, error } = await client
        .from(config.table)
        .delete()
        .eq('id', cleanId)
        .select('id')
        .single();

      if (error) {
        return dbFailure(error, `Não foi possível excluir ${config.label.toLowerCase()}.`);
      }
      if (!data?.id) {
        return fail('DELETE_NOT_CONFIRMED', 'O servidor não confirmou a exclusão do registro.');
      }
    } catch (error) {
      return dbFailure(error, `Não foi possível excluir ${config.label.toLowerCase()}.`);
    }

    if (assets.length === 0) {
      return ok({
        entity: entityKey,
        deleted_id: parent.id,
        cleanup: { attempted: 0, removed: 0, pending: 0 }
      });
    }

    const pending = [];
    let removed = 0;
    const groups = groupAssetsByBucket(assets);

    for (const [bucket, bucketAssets] of groups.entries()) {
      const paths = bucketAssets.map(asset => asset.object_path);
      let storageRemoved = false;

      try {
        const { error } = await client.storage.from(bucket).remove(paths);
        storageRemoved = !error;
      } catch (_) {
        storageRemoved = false;
      }

      if (!storageRemoved) {
        for (const asset of bucketAssets) {
          pending.push({
            id: asset.id,
            bucket_id: asset.bucket_id,
            object_path: asset.object_path,
            stage: 'storage'
          });
        }
        continue;
      }

      removed += bucketAssets.length;

      try {
        const ids = bucketAssets.map(asset => asset.id);
        const { error } = await client
          .from('portal_assets')
          .delete()
          .in('id', ids);

        if (error) {
          for (const asset of bucketAssets) {
            pending.push({
              id: asset.id,
              bucket_id: asset.bucket_id,
              object_path: asset.object_path,
              stage: 'catalog'
            });
          }
        }
      } catch (_) {
        for (const asset of bucketAssets) {
          pending.push({
            id: asset.id,
            bucket_id: asset.bucket_id,
            object_path: asset.object_path,
            stage: 'catalog'
          });
        }
      }
    }

    const data = {
      entity: entityKey,
      deleted_id: parent.id,
      cleanup: {
        attempted: assets.length,
        removed,
        pending: pending.length
      }
    };

    if (pending.length > 0) {
      data.cleanup_pending = pending;
      return ok(data, 'ASSET_CLEANUP_PENDING');
    }

    return ok(data);
  }

  editorial.createLibraryItemWithFile = createLibraryItemWithFile;
  editorial.deleteContent = deleteContent;
  editorial.v11Capabilities = Object.freeze({
    safeDelete: true,
    compositeLibraryCreate: true,
    deleteEntities: Object.freeze(Object.keys(DELETE_ENTITY_CONFIG))
  });
})();
