/**
 * CHRONUS — Editorial Mutation Service
 * Autoridade centralizada para operações de escrita (INSERT, UPDATE), controle editorial
 * e orquestração segura de assets (Storage + portal_assets + compensações) do Narrador.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Singleton: Consome window.ChronusSupabase e window.ChronusAuth.
 * 2. Defesa em Profundidade: Validação frontend de papel 'narrator', tipos, constraints e allowlists fechadas.
 * 3. Autoridade Real: PostgreSQL Row Level Security (RLS), public.is_chronus_narrator() e Storage Policies.
 * 4. Isolamento: Zero DELETE de conteúdo pai, zero secrets e zero junctions nesta fase.
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

  const MIME_EXT_MAP = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
  });

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  // ---------------------------------------------------------------------------
  // 2. CONFIGURAÇÃO FECHADA DE ENTIDADES E ASSETS
  // ---------------------------------------------------------------------------

  const ENTITY_CONFIG = Object.freeze({
    chapter: {
      table: 'chronicle_chapters',
      label: 'Capítulo da Crônica',
      contentType: 'chapter',
      allowedFields: Object.freeze([
        'chapter_number', 'title', 'subtitle', 'slug', 'summary', 'content',
        'cover_image_path', 'visibility', 'sort_order', 'published'
      ]),
      requiredCreate: Object.freeze(['title', 'slug', 'content'])
    },
    session: {
      table: 'campaign_sessions',
      label: 'Sessão de Campanha',
      contentType: 'session',
      allowedFields: Object.freeze([
        'session_number', 'title', 'slug', 'session_date', 'in_game_date',
        'summary', 'events_log', 'clues_uncovered', 'cover_image_path',
        'status', 'visibility', 'sort_order', 'published'
      ]),
      requiredCreate: Object.freeze(['session_number', 'title', 'slug', 'summary'])
    },
    npc: {
      table: 'npcs',
      label: 'Dossiê de NPC',
      contentType: 'npc',
      allowedFields: Object.freeze([
        'name', 'slug', 'portrait_path', 'role_occupation', 'faction',
        'apparent_age', 'public_description', 'known_personality', 'status',
        'relationship_to_group', 'first_appearance_session_id', 'last_appearance_session_id',
        'visibility', 'sort_order', 'published'
      ]),
      requiredCreate: Object.freeze(['name', 'slug'])
    },
    location: {
      table: 'locations',
      label: 'Local do Atlas',
      contentType: 'location',
      allowedFields: Object.freeze([
        'name', 'slug', 'type', 'district_region', 'narrative_address',
        'public_description', 'image_path', 'map_image_path', 'parent_location_id',
        'visibility', 'sort_order', 'published'
      ]),
      requiredCreate: Object.freeze(['name', 'slug', 'type'])
    },
    document: {
      table: 'campaign_documents',
      label: 'Documento / Evidência',
      contentType: 'document',
      allowedFields: Object.freeze([
        'title', 'slug', 'type', 'narrative_date', 'public_description',
        'transcription', 'image_path', 'file_path', 'found_in_session_id',
        'visibility', 'sort_order', 'published'
      ]),
      requiredCreate: Object.freeze(['title', 'slug', 'type'])
    },
    library: {
      table: 'library_items',
      label: 'Item da Biblioteca',
      contentType: 'library',
      allowedFields: Object.freeze([
        'title', 'slug', 'category', 'version', 'description',
        'cover_path', 'file_path', 'file_size_bytes', 'page_count',
        'sort_order', 'visibility', 'published'
      ]),
      requiredCreate: Object.freeze(['title', 'slug', 'category', 'file_path'])
    },
    soundtrack: {
      table: 'soundtrack',
      label: 'Trilha Sonora',
      contentType: null,
      allowedFields: Object.freeze([
        'title', 'youtube_url', 'category', 'description',
        'sort_order', 'visibility', 'active', 'published'
      ]),
      requiredCreate: Object.freeze(['title', 'youtube_url', 'category'])
    }
  });

  const ASSET_CONFIG = Object.freeze({
    chapter: {
      cover: {
        table: 'chronicle_chapters',
        field: 'cover_image_path',
        bucket: 'campaign-images',
        folder: 'chapters',
        contentType: 'chapter',
        maxSize: 5242880, // 5MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      }
    },
    session: {
      cover: {
        table: 'campaign_sessions',
        field: 'cover_image_path',
        bucket: 'campaign-images',
        folder: 'sessions',
        contentType: 'session',
        maxSize: 5242880, // 5MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      }
    },
    npc: {
      portrait: {
        table: 'npcs',
        field: 'portrait_path',
        bucket: 'campaign-images',
        folder: 'npcs',
        contentType: 'npc',
        maxSize: 5242880, // 5MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      }
    },
    location: {
      image: {
        table: 'locations',
        field: 'image_path',
        bucket: 'campaign-images',
        folder: 'locations',
        contentType: 'location',
        maxSize: 5242880, // 5MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      },
      map: {
        table: 'locations',
        field: 'map_image_path',
        bucket: 'maps',
        folder: 'locations',
        contentType: 'location',
        maxSize: 15728640, // 15MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      }
    },
    document: {
      preview: {
        table: 'campaign_documents',
        field: 'image_path',
        bucket: 'documents',
        folder: 'documents',
        contentType: 'document',
        maxSize: 20971520, // 20MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      },
      file: {
        table: 'campaign_documents',
        field: 'file_path',
        bucket: 'documents',
        folder: 'documents',
        contentType: 'document',
        maxSize: 20971520, // 20MB
        allowedMimes: Object.freeze(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
      }
    },
    library: {
      cover: {
        table: 'library_items',
        field: 'cover_path',
        bucket: 'library',
        folder: 'library',
        contentType: 'library',
        maxSize: 52428800, // 50MB
        allowedMimes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
      },
      file: {
        table: 'library_items',
        field: 'file_path',
        bucket: 'library',
        folder: 'library',
        contentType: 'library',
        maxSize: 52428800, // 50MB
        allowedMimes: Object.freeze(['application/pdf'])
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 3. VALIDATORS E SANITIZADORES PUROS (PRIVADOS)
  // ---------------------------------------------------------------------------

  function isValidUUID(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
  }

  function isValidDate(value) {
    if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !isNaN(d.getTime());
  }

  function isSafeInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
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

  function validateFileForSlot(file, slotConfig) {
    if (!file || typeof file !== 'object') {
      return formatError('INVALID_FILE', 'Objeto de arquivo inválido ou não fornecido.');
    }
    const size = typeof file.size === 'number' ? file.size : 0;
    if (size <= 0) {
      return formatError('INVALID_FILE', 'O arquivo não pode ser vazio (tamanho 0 bytes).');
    }
    if (size > slotConfig.maxSize) {
      return formatError('FILE_TOO_LARGE', `Arquivo excede o limite máximo permitido de ${Math.round(slotConfig.maxSize / (1024 * 1024))}MB.`);
    }
    const mime = (file.type || '').toLowerCase().trim();
    if (mime === 'image/svg+xml') {
      return formatError('INVALID_FILE_TYPE', 'Arquivos SVG não são aceitos nesta versão por motivos de segurança.');
    }
    if (!slotConfig.allowedMimes.includes(mime)) {
      return formatError('INVALID_FILE_TYPE', `Tipo de arquivo '${mime || 'desconhecido'}' não permitido para este campo.`);
    }
    const ext = MIME_EXT_MAP[mime];
    if (!ext) {
      return formatError('INVALID_FILE_TYPE', `Extensão correspondente não encontrada para o tipo MIME '${mime}'.`);
    }
    return { ok: true, ext, mime, size };
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
  // 4. VALIDAÇÃO ESPECÍFICA DE CAMPOS POR ENTIDADE
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
  // 5. SANITIZADOR DE PAYLOAD (CREATE / UPDATE)
  // ---------------------------------------------------------------------------

  function sanitizePayload(entityKey, rawData, isUpdate = false) {
    const config = ENTITY_CONFIG[entityKey];
    if (!config) {
      return formatError('INVALID_ENTITY', `Entidade editorial '${entityKey}' não reconhecida.`);
    }

    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return formatError('INVALID_INPUT', 'Os dados devem ser fornecidos como um objeto chave-valor.');
    }

    // Bloqueio rigoroso de campos de sistema e agendamento arbitrário
    const FORBIDDEN_FIELDS = ['id', 'created_at', 'updated_at', 'created_by', 'published_at'];

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

    // No CREATE, se published = true, define published_at inicial
    if (sanitized.published === true) {
      sanitized.published_at = new Date().toISOString();
    } else {
      sanitized.published_at = null;
    }

    return { ok: true, sanitized };
  }

  // ---------------------------------------------------------------------------
  // 6. TRATAMENTO DE ERROS DO SUPABASE / POSTGRES
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
  // 7. CONSULTA AUXILIAR DE REGISTRO PAI (PRIVADO)
  // ---------------------------------------------------------------------------

  async function fetchParentRecord(client, table, id, fieldName) {
    try {
      const { data, error } = await client
        .from(table)
        .select(`id, visibility, published, published_at, ${fieldName}`)
        .eq('id', id)
        .single();
      if (error || !data) {
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // 8. MOTOR DE MUTAÇÃO DE DADOS (PRIVADO)
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
  // 9. ORQUESTRAÇÃO DE ASSETS & STORAGE (PRIVADO)
  // ---------------------------------------------------------------------------

  async function uploadContentAsset(entityKey, slotKey, contentId, file) {
    const authCheck = checkAuthNarrator();
    if (!authCheck.ok) return authCheck;

    if (!isValidUUID(contentId)) {
      return formatError('INVALID_ID', 'Identificador de conteúdo (UUID) inválido.');
    }

    const entitySlots = ASSET_CONFIG[entityKey];
    if (!entitySlots) {
      return formatError('INVALID_ENTITY', `Entidade '${entityKey}' não possui configuração de assets.`);
    }

    const slotConfig = entitySlots[slotKey];
    if (!slotConfig) {
      return formatError('INVALID_ASSET_SLOT', `Slot de asset '${slotKey}' inválido para a entidade '${entityKey}'.`);
    }

    const fileCheck = validateFileForSlot(file, slotConfig);
    if (!fileCheck.ok) return fileCheck;

    const client = getClient();
    if (!client) return formatError('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');

    // 1. Confirmar registro pai
    const parent = await fetchParentRecord(client, slotConfig.table, contentId.trim(), slotConfig.field);
    if (!parent) {
      return formatError('NOT_FOUND', `Registro pai de '${entityKey}' com ID '${contentId}' não encontrado.`);
    }

    // 2. Gerar object_path
    const assetUuid = generateSecureUUID();
    if (!assetUuid) {
      return formatError('SYSTEM_ERROR', 'Falha ao gerar identificador seguro para o arquivo.');
    }
    const objectPath = `${slotConfig.folder}/${contentId.trim()}/${assetUuid}.${fileCheck.ext}`;

    // 3. Upload no Storage
    try {
      const { error: storageErr } = await client.storage
        .from(slotConfig.bucket)
        .upload(objectPath, file, { upsert: false, contentType: fileCheck.mime });

      if (storageErr) {
        return formatError('STORAGE_ERROR', storageErr.message || 'Falha ao realizar upload no Storage.');
      }
    } catch (e) {
      return formatError('STORAGE_ERROR', e.message || 'Exceção durante upload no Storage.');
    }

    // 4. Inserir portal_assets
    const user = window.ChronusAuth?.getUser();
    const portalAssetPayload = {
      bucket_id: slotConfig.bucket,
      object_path: objectPath,
      content_type: slotConfig.contentType,
      content_id: contentId.trim(),
      visibility: parent.visibility || 'players',
      published: Boolean(parent.published),
      published_at: parent.published_at || null,
      created_by: user?.id || null
    };

    try {
      const { error: paErr } = await client
        .from('portal_assets')
        .insert(portalAssetPayload);

      if (paErr) {
        // Compensação: remover arquivo do Storage
        try {
          await client.storage.from(slotConfig.bucket).remove([objectPath]);
        } catch (_) {}
        return handleDbError(paErr);
      }
    } catch (e) {
      try {
        await client.storage.from(slotConfig.bucket).remove([objectPath]);
      } catch (_) {}
      return handleDbError(e);
    }

    // 5. Atualizar tabela pai com o novo path
    try {
      const updatePayload = { [slotConfig.field]: objectPath };
      const { error: parentUpdateErr } = await client
        .from(slotConfig.table)
        .update(updatePayload)
        .eq('id', contentId.trim());

      if (parentUpdateErr) {
        // Compensação dupla: remover portal_assets E remover arquivo do Storage
        let cleanupStorageOk = false;
        let cleanupPaOk = false;
        try {
          const { error: delPaErr } = await client
            .from('portal_assets')
            .delete()
            .match({ bucket_id: slotConfig.bucket, object_path: objectPath });
          cleanupPaOk = !delPaErr;
        } catch (_) {}

        try {
          const { error: delStorageErr } = await client.storage
            .from(slotConfig.bucket)
            .remove([objectPath]);
          cleanupStorageOk = !delStorageErr;
        } catch (_) {}

        if (!cleanupStorageOk || !cleanupPaOk) {
          return formatError('COMPENSATION_FAILED', 'Falha ao atualizar registro pai e compensação parcial de asset.');
        }

        return handleDbError(parentUpdateErr);
      }
    } catch (e) {
      // Compensação em exceção
      try {
        await client.from('portal_assets').delete().match({ bucket_id: slotConfig.bucket, object_path: objectPath });
      } catch (_) {}
      try {
        await client.storage.from(slotConfig.bucket).remove([objectPath]);
      } catch (_) {}
      return handleDbError(e);
    }

    return formatSuccess({
      bucket_id: slotConfig.bucket,
      object_path: objectPath
    });
  }

  async function replaceContentAsset(entityKey, slotKey, contentId, file) {
    const authCheck = checkAuthNarrator();
    if (!authCheck.ok) return authCheck;

    if (!isValidUUID(contentId)) {
      return formatError('INVALID_ID', 'Identificador de conteúdo (UUID) inválido.');
    }

    const entitySlots = ASSET_CONFIG[entityKey];
    if (!entitySlots) {
      return formatError('INVALID_ENTITY', `Entidade '${entityKey}' não possui configuração de assets.`);
    }

    const slotConfig = entitySlots[slotKey];
    if (!slotConfig) {
      return formatError('INVALID_ASSET_SLOT', `Slot de asset '${slotKey}' inválido para a entidade '${entityKey}'.`);
    }

    const client = getClient();
    if (!client) return formatError('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');

    // 1. Obter path antigo do pai
    const parent = await fetchParentRecord(client, slotConfig.table, contentId.trim(), slotConfig.field);
    if (!parent) {
      return formatError('NOT_FOUND', `Registro pai de '${entityKey}' com ID '${contentId}' não encontrado.`);
    }
    const oldPath = parent[slotConfig.field] || null;

    // 2. Fazer upload do novo asset
    const uploadRes = await uploadContentAsset(entityKey, slotKey, contentId, file);
    if (!uploadRes.ok) {
      // Falha no novo: o antigo permanece intacto
      return uploadRes;
    }

    const newAssetData = uploadRes.data;

    // 3. Somente se o novo foi salvo com sucesso e o pai atualizado, limpa o antigo
    let oldAssetCleanupPending = false;
    if (oldPath && typeof oldPath === 'string' && oldPath !== newAssetData.object_path) {
      try {
        // Remover portal_assets antigo
        const { error: paDelErr } = await client
          .from('portal_assets')
          .delete()
          .match({ bucket_id: slotConfig.bucket, object_path: oldPath });
        if (paDelErr) oldAssetCleanupPending = true;

        // Remover arquivo do Storage antigo
        const { error: stDelErr } = await client.storage
          .from(slotConfig.bucket)
          .remove([oldPath]);
        if (stDelErr) oldAssetCleanupPending = true;
      } catch (e) {
        oldAssetCleanupPending = true;
      }
    }

    if (oldAssetCleanupPending) {
      return {
        ok: true,
        data: newAssetData,
        warning: 'OLD_ASSET_CLEANUP_PENDING'
      };
    }

    return formatSuccess(newAssetData);
  }

  // ---------------------------------------------------------------------------
  // 10. API PÚBLICA SEMÂNTICA
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
  // 11. CONTROLES RÁPIDOS DE ESTADO E SINCRONIZAÇÃO COM PORTAL_ASSETS
  // ---------------------------------------------------------------------------

  async function setPublication(entityKey, id, options) {
    const authCheck = checkAuthNarrator();
    if (!authCheck.ok) return authCheck;

    if (!isValidUUID(id)) {
      return formatError('INVALID_ID', 'Identificador de registro (UUID) inválido.');
    }

    if (!options || typeof options.published !== 'boolean') {
      return formatError('INVALID_INPUT', "O parâmetro 'published' (boolean) é obrigatório.");
    }

    const config = ENTITY_CONFIG[entityKey];
    if (!config) {
      return formatError('INVALID_ENTITY', `Entidade '${entityKey}' inválida.`);
    }

    const client = getClient();
    if (!client) return formatError('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');

    // 1. Obter estado anterior do pai
    let prevParent = null;
    try {
      const { data, error } = await client
        .from(config.table)
        .select('id, published, published_at')
        .eq('id', id.trim())
        .single();
      if (error || !data) {
        return formatError('NOT_FOUND', `Registro '${entityKey}' com ID '${id}' não encontrado.`);
      }
      prevParent = data;
    } catch (e) {
      return handleDbError(e);
    }

    const newPublished = Boolean(options.published);
    const newPublishedAt = newPublished ? new Date().toISOString() : null;

    // 2. Atualizar tabela pai
    let updatedParent = null;
    try {
      const { data, error } = await client
        .from(config.table)
        .update({ published: newPublished, published_at: newPublishedAt })
        .eq('id', id.trim())
        .select()
        .single();

      if (error) return handleDbError(error);
      updatedParent = data;
    } catch (e) {
      return handleDbError(e);
    }

    // 3. Se entidade possui contentType, sincroniza portal_assets
    if (config.contentType) {
      try {
        const { error: paErr } = await client
          .from('portal_assets')
          .update({ published: newPublished, published_at: newPublishedAt })
          .match({ content_type: config.contentType, content_id: id.trim() });

        if (paErr) {
          // Tentativa de rollback no pai
          let rollbackOk = false;
          try {
            const { error: rbErr } = await client
              .from(config.table)
              .update({ published: prevParent.published, published_at: prevParent.published_at })
              .eq('id', id.trim());
            rollbackOk = !rbErr;
          } catch (_) {}

          if (rollbackOk) {
            return formatError('DATABASE_ERROR', 'Falha ao sincronizar assets; alteração no conteúdo revertida.');
          } else {
            return formatError('PARTIAL_FAILURE', 'Falha ao sincronizar assets e falha na reversão do estado do conteúdo.');
          }
        }
      } catch (e) {
        // Exceção: tentar rollback
        try {
          await client.from(config.table).update({ published: prevParent.published, published_at: prevParent.published_at }).eq('id', id.trim());
        } catch (_) {}
        return formatError('DATABASE_ERROR', e.message || 'Exceção ao sincronizar assets.');
      }
    }

    return formatSuccess(updatedParent);
  }

  async function setVisibility(entityKey, id, visibility) {
    const authCheck = checkAuthNarrator();
    if (!authCheck.ok) return authCheck;

    if (!isValidUUID(id)) {
      return formatError('INVALID_ID', 'Identificador de registro (UUID) inválido.');
    }

    if (typeof visibility !== 'string' || !ALLOWED_VISIBILITIES.includes(visibility.trim())) {
      return formatError('INVALID_INPUT', `Visibilidade inválida. Valores aceitos: ${ALLOWED_VISIBILITIES.join(', ')}`);
    }

    const cleanVisibility = visibility.trim();
    const config = ENTITY_CONFIG[entityKey];
    if (!config) {
      return formatError('INVALID_ENTITY', `Entidade '${entityKey}' inválida.`);
    }

    const client = getClient();
    if (!client) return formatError('CLIENT_UNAVAILABLE', 'Cliente de banco de dados indisponível.');

    // 1. Obter estado anterior do pai
    let prevParent = null;
    try {
      const { data, error } = await client
        .from(config.table)
        .select('id, visibility')
        .eq('id', id.trim())
        .single();
      if (error || !data) {
        return formatError('NOT_FOUND', `Registro '${entityKey}' com ID '${id}' não encontrado.`);
      }
      prevParent = data;
    } catch (e) {
      return handleDbError(e);
    }

    // 2. Atualizar tabela pai
    let updatedParent = null;
    try {
      const { data, error } = await client
        .from(config.table)
        .update({ visibility: cleanVisibility })
        .eq('id', id.trim())
        .select()
        .single();

      if (error) return handleDbError(error);
      updatedParent = data;
    } catch (e) {
      return handleDbError(e);
    }

    // 3. Se entidade possui contentType, sincroniza portal_assets
    if (config.contentType) {
      try {
        const { error: paErr } = await client
          .from('portal_assets')
          .update({ visibility: cleanVisibility })
          .match({ content_type: config.contentType, content_id: id.trim() });

        if (paErr) {
          // Tentativa de rollback no pai
          let rollbackOk = false;
          try {
            const { error: rbErr } = await client
              .from(config.table)
              .update({ visibility: prevParent.visibility })
              .eq('id', id.trim());
            rollbackOk = !rbErr;
          } catch (_) {}

          if (rollbackOk) {
            return formatError('DATABASE_ERROR', 'Falha ao sincronizar assets; alteração no conteúdo revertida.');
          } else {
            return formatError('PARTIAL_FAILURE', 'Falha ao sincronizar assets e falha na reversão do estado do conteúdo.');
          }
        }
      } catch (e) {
        try {
          await client.from(config.table).update({ visibility: prevParent.visibility }).eq('id', id.trim());
        } catch (_) {}
        return formatError('DATABASE_ERROR', e.message || 'Exceção ao sincronizar assets.');
      }
    }

    return formatSuccess(updatedParent);
  }

  async function setSortOrder(entityKey, id, sortOrder) {
    return executeUpdate(entityKey, id, { sort_order: sortOrder });
  }

  // ---------------------------------------------------------------------------
  // 12. EXPORTAÇÃO PÚBLICA DO SERVIÇO
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

    // Assets / Storage (Orquestração Segura)
    uploadContentAsset,
    replaceContentAsset,

    // Controles de Publicação, Visibilidade e Ordem
    setPublication,
    setVisibility,
    setSortOrder,

    // Utilitário de Consulta
    validateSafeYoutubeUrl
  };
})();
