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

  function groupAssetsByBucket(assets) {
    const groups = new Map();
    for (const asset of assets) {
      if (!asset?.id || !asset?.bucket_id || !asset?.object_path) continue;
      if (!groups.has(asset.bucket_id)) groups.set(asset.bucket_id, []);
      groups.get(asset.bucket_id).push(asset);
    }
    return groups;
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

    // Gate 1: o pai precisa existir e ser visível ao Narrador via RLS.
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

    // Gate 2: para entidades com Storage, o catálogo de assets precisa ser lido
    // ANTES do DELETE. Se essa leitura falhar, aborta sem tocar no conteúdo.
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

    // O pai é apagado primeiro. Secrets/junctions usam ON DELETE CASCADE e
    // referências externas relevantes usam ON DELETE SET NULL.
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

    // Sem assets, a exclusão terminou aqui.
    if (assets.length === 0) {
      return ok({
        entity: entityKey,
        deleted_id: parent.id,
        cleanup: { attempted: 0, removed: 0, pending: 0 }
      });
    }

    // Cleanup pós-delete: Storage físico primeiro; catálogo depois.
    // Se o Storage falhar, NÃO apagamos portal_assets, preservando a trilha.
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

      // Só remove o catálogo após o Storage confirmar a remoção física.
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

  editorial.deleteContent = deleteContent;
  editorial.v11Capabilities = Object.freeze({
    safeDelete: true,
    deleteEntities: Object.freeze(Object.keys(DELETE_ENTITY_CONFIG))
  });
})();
