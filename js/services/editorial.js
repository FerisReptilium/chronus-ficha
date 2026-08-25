/**
 * CHRONUS — Editorial Mutation Service
 * Autoridade centralizada para operações de escrita (INSERT, UPDATE) e controle editorial do Narrador.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Singleton: Consome window.ChronusSupabase e window.ChronusAuth.
 * 2. Defesa em Profundidade: Validação frontend de papel 'narrator', tipos, constraints e allowlist fechada de entidades e campos.
 * 3. Autoridade Real: PostgreSQL Row Level Security (RLS) e public.is_chronus_narrator().
 * 4. Isolamento: Zero Storage, zero DELETE e zero portal_assets nesta fundação.
 */

window.ChronusEditorial = (function() {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. ALLOWLISTS E CONSTANTES ESTRITAS (Conforme Migration 001)
  // ---------------------------------------------------------------------------

  const ALLOWED_VISIBILITIES = Object.freeze(['public', 'players', 'narrator']);

  const ALLOWED_SESSION_STATUSES = Object.freeze(['planned', 'in_progress', 'completed', 'canceled']);

  const ALLOWED_NPC_STATUSES = Object.freeze(['alive', 'dead', 'missing', 'unknown', 'transformed']);

  const ALLOWED_LOCATION_TYPES = Object.freeze([
    'city', 'district', 'building', 'bunker', 'club', 'facility', 'supernatural_domain', 'battlemap', 'other'
  ]);

  const ALLOWED_DOCUMENT_TYPES = Object.freeze([
    'photograph', 'letter', 'report', 'newspaper_clipping', 'official_record', 'clue', 'artifact', 'audio_log', 'other'
  ]);

  const ALLOWED_SOUNDTRACK_CATEGORIES = Object.freeze([
    'theme', 'investigation', 'horror', 'combat', 'suspense', 'epilogue', 'ambient'
  ]);

  const ALLOWED_LIBRARY_CATEGORIES = Object.freeze([
    'system_book', 'pocket_manual', 'quick_guide', 'character_sheet', 'supplement', 'extra'
  ]);

  const ALLOWED_YOUTUBE_HOSTS = Object.freeze([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be'
  ]);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  // Configuração interna fechada de entidades editoriais
  const ENTITY_CONFIG = Object.freeze({
    chapter: {
      table: 'chronicle_chapters',
      label: 'Capítulo da Crônica',
      allowedFields: Object.freeze([
        'chapter_number', 'title', 'subtitle', 'slug', 'summary', 'content',
        'cover_image_path', 'visibility', 'sort_order', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['title', 'slug', 'content'])
    },
    session: {
      table: 'campaign_sessions',
      label: 'Sessão de Campanha',
      allowedFields: Object.freeze([
        'session_number', 'title', 'slug', 'session_date', 'in_game_date',
        'summary', 'events_log', 'clues_uncovered', 'cover_image_path',
        'status', 'visibility', 'sort_order', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['session_number', 'title', 'slug', 'summary'])
    },
    npc: {
      table: 'npcs',
      label: 'Dossiê de NPC',
      allowedFields: Object.freeze([
        'name', 'slug', 'portrait_path', 'role_occupation', 'faction',
        'apparent_age', 'public_description', 'known_personality', 'status',
        'relationship_to_group', 'first_appearance_session_id', 'last_appearance_session_id',
        'visibility', 'sort_order', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['name', 'slug'])
    },
    location: {
      table: 'locations',
      label: 'Local do Atlas',
      allowedFields: Object.freeze([
        'name', 'slug', 'type', 'district_region', 'narrative_address',
        'public_description', 'image_path', 'map_image_path', 'parent_location_id',
        'visibility', 'sort_order', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['name', 'slug', 'type'])
    },
    document: {
      table: 'campaign_documents',
      label: 'Documento / Evidência',
      allowedFields: Object.freeze([
        'title', 'slug', 'type', 'narrative_date', 'public_description',
        'transcription', 'image_path', 'file_path', 'found_in_session_id',
        'visibility', 'sort_order', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['title', 'slug', 'type'])
    },
    library: {
      table: 'library_items',
      label: 'Item da Biblioteca',
      allowedFields: Object.freeze([
        'title', 'slug', 'category', 'version', 'description',
        'cover_path', 'file_path', 'file_size_bytes', 'page_count',
        'sort_order', 'visibility', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['title', 'slug', 'category', 'file_path'])
    },
    soundtrack: {
      table: 'soundtrack',
      label: 'Trilha Sonora',
      allowedFields: Object.freeze([
        'title', 'youtube_url', 'category', 'description',
        'sort_order', 'visibility', 'active', 'published', 'published_at'
      ]),
      requiredCreate: Object.freeze(['title', 'youtube_url', 'category'])
    }
  });

  // ---------------------------------------------------------------------------
  // 2. VALIDATORS E SANITIZADORES PUROS (PRIVADOS)
  // ---------------------------------------------------------------------------

  function isValidUUID(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
  }

  function isValidDate(value) {
    if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !isNaN(d.getTime());
  }

  function isValidTimestamp(value) {
    if (typeof value !== 'string') return false;
    const d = new Date(value);
    return !isNaN(d.getTime());
  }

  function isSafeInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
  }

  function validateSafeYoutubeUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
      return { ok: false, message: 'URL do YouTube obrigatória.' };
    }
    const cleanUrl = url.trim();
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol !== 'https:') {
        return { ok: false, message: 'A URL do YouTube deve utilizar protocolo HTTPS exclusivamente.' };
      }
      if (parsed.username || parsed.password) {
        return { ok: false, message: 'A URL não pode conter credenciais de usuário.' };
      }
      if (parsed.port && parsed.port !== '443') {
        return { ok: false, message: 'Portas customizadas são estritamente proibidas.' };
      }
      const host = parsed.hostname.toLowerCase();
      if (!ALLOWED_YOUTUBE_HOSTS.includes(host)) {
        return { ok: false, message: 'Host inválido. Permitido apenas YouTube oficial.' };
      }
      return { ok: true, url: parsed.toString() };
    } catch (e) {
      return { ok: false, message: 'URL malformada ou inválida.' };
    }
  }

  function formatError(code, message) {
    return { ok: false, code, message };
  }

  function formatSuccess(data) {
    return { ok: true, data };
  }

  function checkAuthNarrator() {
    const profile = window.ChronusAuth?.getProfile();
    if (!profile || profile.role !== 'narrator') {
      return formatError('NOT_NARRATOR', 'Ação exclusiva para o Narrador autenticado.');
    }
    return { ok: true };
  }

  function getClient() {
    const client = window.ChronusSupabase?.getClient();
    if (!client) {
      return null;
    }
    return client;
  }

  // ---------------------------------------------------------------------------
  // 3. VALIDAÇÃO ESPECÍFICA DE CAMPOS POR ENTIDADE
  // ---------------------------------------------------------------------------

  function validateField(entityKey, field, value) {
    if (value === null || value === undefined) {
      return { ok: true, value: null };
    }

    switch (field) {
      // Visibilidade
      case 'visibility':
        if (typeof value !== 'string' || !ALLOWED_VISIBILITIES.includes(value.trim())) {
          return formatError('INVALID_INPUT', `Visibilidade inválida. Valores aceitos: ${ALLOWED_VISIBILITIES.join(', ')}`);
        }
        return { ok: true, value: value.trim() };

      // Flags booleanas
      case 'published':
      case 'active':
        if (typeof value !== 'boolean') {
          return formatError('INVALID_INPUT', `O campo '${field}' deve ser estritamente booleano.`);
        }
        return { ok: true, value };

      // Timestamps
      case 'published_at':
        if (!isValidTimestamp(value)) {
          return formatError('INVALID_INPUT', `O campo 'published_at' deve ser uma data/hora ISO válida.`);
        }
        return { ok: true, value: new Date(value).toISOString() };

      // Inteiros
      case 'sort_order':
      case 'chapter_number':
      case 'session_number':
      case 'file_size_bytes':
      case 'page_count':
        if (!isSafeInteger(value)) {
          return formatError('INVALID_INPUT', `O campo '${field}' deve ser um número inteiro válido.`);
        }
        return { ok: true, value };

      // Datas
      case 'session_date':
        if (!isValidDate(value)) {
          return formatError('INVALID_INPUT', `O campo 'session_date' deve estar no formato AAAA-MM-DD.`);
        }
        return { ok: true, value: value.trim() };

      // Foreign Keys UUID
      case 'parent_location_id':
      case 'first_appearance_session_id':
      case 'last_appearance_session_id':
      case 'found_in_session_id':
        if (!isValidUUID(value)) {
          return formatError('INVALID_INPUT', `O campo '${field}' deve ser um UUID válido ou nulo.`);
        }
        return { ok: true, value: value.trim() };

      // YouTube URL
      case 'youtube_url': {
        const ytCheck = validateSafeYoutubeUrl(value);
        if (!ytCheck.ok) {
          return formatError('INVALID_INPUT', ytCheck.message);
        }
        return { ok: true, value: ytCheck.url };
      }

      // Enums de status e tipo
      case 'status':
        if (entityKey === 'session') {
          if (!ALLOWED_SESSION_STATUSES.includes(value)) {
            return formatError('INVALID_INPUT', `Status de sessão inválido. Valores aceitos: ${ALLOWED_SESSION_STATUSES.join(', ')}`);
          }
        } else if (entityKey === 'npc') {
          if (!ALLOWED_NPC_STATUSES.includes(value)) {
            return formatError('INVALID_INPUT', `Status de NPC inválido. Valores aceitos: ${ALLOWED_NPC_STATUSES.join(', ')}`);
          }
        }
        return { ok: true, value };

      case 'type':
        if (entityKey === 'location') {
          if (!ALLOWED_LOCATION_TYPES.includes(value)) {
            return formatError('INVALID_INPUT', `Tipo de local inválido. Valores aceitos: ${ALLOWED_LOCATION_TYPES.join(', ')}`);
          }
        } else if (entityKey === 'document') {
          if (!ALLOWED_DOCUMENT_TYPES.includes(value)) {
            return formatError('INVALID_INPUT', `Tipo de documento inválido. Valores aceitos: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`);
          }
        }
        return { ok: true, value };

      case 'category':
        if (entityKey === 'soundtrack') {
          if (!ALLOWED_SOUNDTRACK_CATEGORIES.includes(value)) {
            return formatError('INVALID_INPUT', `Categoria de trilha inválida. Valores aceitos: ${ALLOWED_SOUNDTRACK_CATEGORIES.join(', ')}`);
          }
        } else if (entityKey === 'library') {
          if (!ALLOWED_LIBRARY_CATEGORIES.includes(value)) {
            return formatError('INVALID_INPUT', `Categoria da biblioteca inválida. Valores aceitos: ${ALLOWED_LIBRARY_CATEGORIES.join(', ')}`);
          }
        }
        return { ok: true, value };

      // Slugs e identificadores curtos
      case 'slug':
        if (typeof value !== 'string' || !value.trim()) {
          return formatError('INVALID_INPUT', 'O slug não pode ser vazio.');
        }
        return { ok: true, value: value.trim().toLowerCase() };

      case 'title':
      case 'name':
      case 'version':
        if (typeof value !== 'string' || !value.trim()) {
          return formatError('INVALID_INPUT', `O campo '${field}' é obrigatório e não pode ser vazio.`);
        }
        return { ok: true, value: value.trim() };

      // Textos longos ou opcionais (preserva whitespace de formatação/parágrafos)
      case 'subtitle':
      case 'summary':
      case 'content':
      case 'events_log':
      case 'clues_uncovered':
      case 'public_description':
      case 'known_personality':
      case 'relationship_to_group':
      case 'role_occupation':
      case 'faction':
      case 'apparent_age':
      case 'district_region':
      case 'narrative_address':
      case 'narrative_date':
      case 'transcription':
      case 'description':
      case 'in_game_date':
      case 'cover_image_path':
      case 'portrait_path':
      case 'image_path':
      case 'map_image_path':
      case 'cover_path':
      case 'file_path':
        if (typeof value !== 'string') {
          return formatError('INVALID_INPUT', `O campo '${field}' deve ser uma string de texto.`);
        }
        return { ok: true, value: value.trim() };

      default:
        return formatError('INVALID_FIELD', `Campo desconhecido ou não suportado: '${field}'`);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. SANITIZADOR DE PAYLOAD (CREATE / UPDATE)
  // ---------------------------------------------------------------------------

  function sanitizePayload(entityKey, rawData, isUpdate = false) {
    const config = ENTITY_CONFIG[entityKey];
    if (!config) {
      return formatError('INVALID_ENTITY', `Entidade editorial '${entityKey}' não reconhecida.`);
    }

    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return formatError('INVALID_INPUT', 'Os dados devem ser fornecidos como um objeto chave-valor.');
    }

    // Bloqueio rigoroso de campos de sistema caso enviados na UI
    const FORBIDDEN_FIELDS = ['id', 'created_at', 'updated_at', 'created_by'];

    const sanitized = {};
    const keys = Object.keys(rawData);

    for (const key of keys) {
      if (FORBIDDEN_FIELDS.includes(key)) continue;

      if (!config.allowedFields.includes(key)) {
        return formatError('INVALID_FIELD', `O campo '${key}' não é permitido na entidade '${config.label}'.`);
      }

      const valResult = validateField(entityKey, key, rawData[key]);
      if (!valResult.ok) {
        return valResult;
      }
      sanitized[key] = valResult.value;
    }

    if (isUpdate) {
      if (Object.keys(sanitized).length === 0) {
        return formatError('EMPTY_PATCH', 'Nenhum campo válido para atualização foi fornecido.');
      }
      return { ok: true, sanitized };
    }

    // Validação de obrigatórios no CREATE
    for (const reqField of config.requiredCreate) {
      if (!(reqField in sanitized) || sanitized[reqField] === null || sanitized[reqField] === '') {
        return formatError('INVALID_INPUT', `O campo obrigatório '${reqField}' não foi informado para ${config.label}.`);
      }
    }

    return { ok: true, sanitized };
  }

  // ---------------------------------------------------------------------------
  // 5. TRATAMENTO DE ERROS DO SUPABASE / POSTGRES
  // ---------------------------------------------------------------------------

  function handleDbError(err) {
    if (!err) return formatError('DATABASE_ERROR', 'Erro desconhecido no banco de dados.');
    
    // PostgreSQL Unique Violation (23505)
    if (err.code === '23505') {
      return formatError('CONFLICT', 'Conflito de unicidade: slug, número de sessão ou identificador já existente.');
    }

    // PostgreSQL Insufficient Privilege / RLS Denied (42501)
    if (err.code === '42501') {
      return formatError('RLS_DENIED', 'Acesso negado pelas políticas de segurança do servidor.');
    }

    return formatError('DATABASE_ERROR', err.message || 'Erro ao processar operação no banco de dados.');
  }

  // ---------------------------------------------------------------------------
  // 6. MOTOR DE MUTAÇÃO GENÉRICO SEGURO (PRIVADO)
  // ---------------------------------------------------------------------------

  async function executeCreate(entityKey, rawData) {
    const authCheck = checkAuthNarrator();
    if (!authCheck.ok) return authCheck;

    const client = getClient();
    if (!client) return formatError('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');

    const config = ENTITY_CONFIG[entityKey];
    if (!config) return formatError('INVALID_ENTITY', `Entidade '${entityKey}' inválida.`);

    const payloadResult = sanitizePayload(entityKey, rawData, false);
    if (!payloadResult.ok) return payloadResult;

    const payload = payloadResult.sanitized;

    // Injetar created_by através do usuário autenticado no ChronusAuth
    const user = window.ChronusAuth?.getUser();
    if (user?.id) {
      payload.created_by = user.id;
    }

    try {
      const { data, error } = await client
        .from(config.table)
        .insert(payload)
        .select()
        .single();

      if (error) {
        return handleDbError(error);
      }

      return formatSuccess(data);
    } catch (e) {
      return handleDbError(e);
    }
  }

  async function executeUpdate(entityKey, id, rawData) {
    const authCheck = checkAuthNarrator();
    if (!authCheck.ok) return authCheck;

    if (!isValidUUID(id)) {
      return formatError('INVALID_ID', 'Identificador de registro (UUID) inválido.');
    }

    const client = getClient();
    if (!client) return formatError('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');

    const config = ENTITY_CONFIG[entityKey];
    if (!config) return formatError('INVALID_ENTITY', `Entidade '${entityKey}' inválida.`);

    const payloadResult = sanitizePayload(entityKey, rawData, true);
    if (!payloadResult.ok) return payloadResult;

    const payload = payloadResult.sanitized;

    try {
      const { data, error } = await client
        .from(config.table)
        .update(payload)
        .eq('id', id.trim())
        .select()
        .single();

      if (error) {
        return handleDbError(error);
      }

      return formatSuccess(data);
    } catch (e) {
      return handleDbError(e);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. API PÚBLICA SEMÂNTICA
  // ---------------------------------------------------------------------------

  // Crônica
  async function createChapter(data) {
    return executeCreate('chapter', data);
  }

  async function updateChapter(id, data) {
    return executeUpdate('chapter', id, data);
  }

  // Sessões
  async function createSession(data) {
    return executeCreate('session', data);
  }

  async function updateSession(id, data) {
    return executeUpdate('session', id, data);
  }

  // NPCs
  async function createNPC(data) {
    return executeCreate('npc', data);
  }

  async function updateNPC(id, data) {
    return executeUpdate('npc', id, data);
  }

  // Locais
  async function createLocation(data) {
    return executeCreate('location', data);
  }

  async function updateLocation(id, data) {
    return executeUpdate('location', id, data);
  }

  // Documentos
  async function createDocument(data) {
    return executeCreate('document', data);
  }

  async function updateDocument(id, data) {
    return executeUpdate('document', id, data);
  }

  // Biblioteca
  async function createLibraryItem(data) {
    return executeCreate('library', data);
  }

  async function updateLibraryItem(id, data) {
    return executeUpdate('library', id, data);
  }

  // Trilha Sonora
  async function createSoundtrack(data) {
    return executeCreate('soundtrack', data);
  }

  async function updateSoundtrack(id, data) {
    return executeUpdate('soundtrack', id, data);
  }

  // ---------------------------------------------------------------------------
  // 8. CONTROLES RÁPIDOS DE ESTADO (PUBLICADO, VISIBILIDADE, ORDEM)
  // ---------------------------------------------------------------------------

  async function setPublication(entityKey, id, options) {
    if (!options || typeof options.published !== 'boolean') {
      return formatError('INVALID_INPUT', "O parâmetro 'published' (boolean) é obrigatório.");
    }

    const patch = {
      published: options.published
    };

    if (options.published) {
      if ('published_at' in options) {
        patch.published_at = options.published_at;
      } else {
        patch.published_at = new Date().toISOString();
      }
    } else {
      patch.published_at = null;
    }

    return executeUpdate(entityKey, id, patch);
  }

  async function setVisibility(entityKey, id, visibility) {
    return executeUpdate(entityKey, id, { visibility });
  }

  async function setSortOrder(entityKey, id, sortOrder) {
    return executeUpdate(entityKey, id, { sort_order: sortOrder });
  }

  // ---------------------------------------------------------------------------
  // 9. EXPORTAÇÃO PÚBLICA DO SERVIÇO
  // ---------------------------------------------------------------------------

  return {
    // Crônica
    createChapter,
    updateChapter,

    // Sessões
    createSession,
    updateSession,

    // NPCs
    createNPC,
    updateNPC,

    // Locais
    createLocation,
    updateLocation,

    // Documentos
    createDocument,
    updateDocument,

    // Biblioteca
    createLibraryItem,
    updateLibraryItem,

    // Trilha Sonora
    createSoundtrack,
    updateSoundtrack,

    // Controles de Publicação e Exibição
    setPublication,
    setVisibility,
    setSortOrder,

    // Validador utilitário (somente leitura / consulta)
    validateSafeYoutubeUrl
  };
})();
