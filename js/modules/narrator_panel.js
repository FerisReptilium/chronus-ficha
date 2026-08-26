/**
 * CHRONUS — Narrator Panel Module (v2C Fast-Track 1)
 * Painel administrativo unificado do Narrador:
 * 1. Mesa de Jogadores (Fichas em tempo real somente leitura)
 * 2. Gestão Editorial (Shell visual e Form Engine unificado de CRUD para as 7 áreas)
 */
window.ChronusNarratorPanel = (function() {
  'use strict';

  // Estado interno do Painel
  let activeMainTab = 'players'; // 'players' | 'editorial'
  let activeEditorialSection = 'dashboard'; // 'dashboard' | 'chapter' | 'session' | 'npc' | 'location' | 'document' | 'library' | 'soundtrack'
  let currentCmsRequestId = 0;
  let editorialCache = {};
  let currentSearchQuery = '';
  let currentFilter = 'all'; // 'all' | 'published' | 'draft'

  // Estado Unificado do Form Engine (Fast-Track 1)
  let isEditing = false;
  let activeFormEntity = null; // 'chapter' | 'session' | 'npc' | 'location' | 'document' | 'library' | 'soundtrack'
  let formMode = 'create'; // 'create' | 'edit'
  let editingRecordId = null;
  let formInitialValues = {};
  let formIsDirty = false;
  let formIsSubmitting = false;
  let formIsSlugTouched = false;
  let feedbackMessage = null;

  // Definição das 7 Seções Editoriais
  const EDITORIAL_SECTIONS = [
    { id: 'chapter', name: 'Crônica', icon: '📖', entity: 'chapter', desc: 'Capítulos e arcos da narrativa principal', emptyMsg: 'Nenhum capítulo cadastrado.' },
    { id: 'session', name: 'Sessões', icon: '🎲', entity: 'session', desc: 'Diários de sessão e registros de mesa', emptyMsg: 'Nenhuma sessão cadastrada.' },
    { id: 'npc', name: 'NPCs', icon: '👤', entity: 'npc', desc: 'Dossiê de contatos, aliados e antagonistas', emptyMsg: 'Nenhum NPC cadastrado.' },
    { id: 'location', name: 'Locais', icon: '🗺️', entity: 'location', desc: 'Atlas, distritos urbanos e mapas', emptyMsg: 'Nenhum local cadastrado.' },
    { id: 'document', name: 'Documentos', icon: '📁', entity: 'document', desc: 'Evidências materiais e cartas de época', emptyMsg: 'Nenhum documento cadastrado.' },
    { id: 'library', name: 'Biblioteca', icon: '📚', entity: 'library', desc: 'Manuais oficiais e livros de regras', emptyMsg: 'Nenhum item de biblioteca cadastrado.' },
    { id: 'soundtrack', name: 'Trilha Sonora', icon: '🎵', entity: 'soundtrack', desc: 'Temas musicais e ambientações da crônica', emptyMsg: 'Nenhuma trilha sonora cadastrada.' }
  ];

  // Configuração Fechada do Form Engine Unificado
  const EDITOR_FORM_CONFIG = Object.freeze({
    chapter: {
      label: 'Capítulo da Crônica',
      singular: 'Capítulo',
      newBtnLabel: '+ Novo Capítulo',
      allowCreate: true,
      allowUpdate: true,
      createMethod: 'createChapter',
      updateMethod: 'updateChapter',
      hasSlug: true,
      slugSource: 'title',
      coverField: 'cover_image_path',
      coverBucket: 'campaign-images',
      fields: [
        { name: 'title', label: 'Título do Capítulo *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Sombras de Praga' },
        { name: 'slug', label: 'Slug (Identificador URL) *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: sombras-de-praga' },
        { name: 'chapter_number', label: 'Número do Capítulo (Opcional)', type: 'number', required: false, gridFull: false, min: 1, step: 1, placeholder: 'Ex: 1' },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'subtitle', label: 'Subtítulo (Opcional)', type: 'text', required: false, gridFull: true, placeholder: 'Ex: Ato I — A Quebra do Sigilo' },
        { name: 'summary', label: 'Resumo da Trama (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Breve síntese dos acontecimentos do capítulo…' },
        { name: 'content', label: 'Conteúdo Narrativo Completo *', type: 'textarea', required: true, rows: 10, gridFull: true, placeholder: 'Texto integral do capítulo da crônica…' }
      ]
    },
    session: {
      label: 'Sessão de Campanha',
      singular: 'Sessão',
      newBtnLabel: '+ Nova Sessão',
      allowCreate: true,
      allowUpdate: true,
      createMethod: 'createSession',
      updateMethod: 'updateSession',
      hasSlug: true,
      slugSource: 'title',
      coverField: 'cover_image_path',
      coverBucket: 'campaign-images',
      fields: [
        { name: 'session_number', label: 'Número da Sessão *', type: 'number', required: true, min: 1, step: 1, gridFull: false, placeholder: 'Ex: 1' },
        { name: 'title', label: 'Título da Sessão *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Noite de Conspiração' },
        { name: 'slug', label: 'Slug (Identificador URL) *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: noite-de-conspiracao' },
        { name: 'status', label: 'Status da Sessão *', type: 'select', required: true, gridFull: false, options: [
          { value: 'planned', label: 'Planejada' },
          { value: 'in_progress', label: 'Em Andamento' },
          { value: 'completed', label: 'Concluída' },
          { value: 'canceled', label: 'Cancelada' }
        ], defaultValue: 'planned' },
        { name: 'session_date', label: 'Data Real da Sessão (AAAA-MM-DD)', type: 'date', required: false, gridFull: false, placeholder: 'Ex: 2026-08-25' },
        { name: 'in_game_date', label: 'Data no Jogo / Narrativa (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: 12 de Outubro de 1923' },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'summary', label: 'Resumo da Sessão *', type: 'textarea', required: true, rows: 3, gridFull: true, placeholder: 'Síntese narrativa do que ocorreu na sessão…' },
        { name: 'events_log', label: 'Registro de Eventos / Log de Fatos (Opcional)', type: 'textarea', required: false, rows: 5, gridFull: true, placeholder: 'Cronologia detalhada dos acontecimentos da mesa…' },
        { name: 'clues_uncovered', label: 'Pistas e Evidências Reveladas (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Pistas que os jogadores encontraram…' }
      ]
    },
    npc: {
      label: 'Dossiê de NPC',
      singular: 'NPC',
      newBtnLabel: '+ Novo NPC',
      allowCreate: true,
      allowUpdate: true,
      createMethod: 'createNPC',
      updateMethod: 'updateNPC',
      hasSlug: true,
      slugSource: 'name',
      coverField: 'portrait_path',
      coverBucket: 'campaign-images',
      fields: [
        { name: 'name', label: 'Nome do NPC *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Viktor Kane' },
        { name: 'slug', label: 'Slug (Identificador URL) *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: viktor-kane' },
        { name: 'role_occupation', label: 'Ocupação / Papel no Cenário (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: Antiquário / Ocultista' },
        { name: 'faction', label: 'Facção / Aliança (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: Ordem Hermética de Praga' },
        { name: 'apparent_age', label: 'Idade Aparente (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: 45 anos' },
        { name: 'status', label: 'Status do NPC *', type: 'select', required: true, gridFull: false, options: [
          { value: 'alive', label: 'Vivo' },
          { value: 'dead', label: 'Morto' },
          { value: 'missing', label: 'Desaparecido' },
          { value: 'unknown', label: 'Desconhecido' },
          { value: 'transformed', label: 'Transformado' }
        ], defaultValue: 'alive' },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'first_appearance_session_id', label: '1ª Aparição (Sessão Opcional)', type: 'fk_session', required: false, gridFull: false },
        { name: 'last_appearance_session_id', label: 'Última Aparição (Sessão Opcional)', type: 'fk_session', required: false, gridFull: false },
        { name: 'public_description', label: 'Descrição Pública e Aparência (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Aparência física, vestimentas e primeira impressão…' },
        { name: 'known_personality', label: 'Personalidade e Comportamento Conhecido (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Traços psicológicos e postura observada pelos jogadores…' },
        { name: 'relationship_to_group', label: 'Relação com a Cabala / Grupo (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Aliado, contato comercial, informante, antagonista…' }
      ]
    },
    location: {
      label: 'Local do Atlas',
      singular: 'Local',
      newBtnLabel: '+ Novo Local',
      allowCreate: true,
      allowUpdate: true,
      createMethod: 'createLocation',
      updateMethod: 'updateLocation',
      hasSlug: true,
      slugSource: 'name',
      coverField: 'image_path',
      coverBucket: 'maps',
      fields: [
        { name: 'name', label: 'Nome do Local *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Refúgio Subterrâneo' },
        { name: 'slug', label: 'Slug (Identificador URL) *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: refugio-subterraneo' },
        { name: 'type', label: 'Tipo de Local *', type: 'select', required: true, gridFull: false, options: [
          { value: 'city', label: 'Cidade' },
          { value: 'district', label: 'Distrito / Bairro' },
          { value: 'building', label: 'Edifício' },
          { value: 'bunker', label: 'Bunker / Refúgio' },
          { value: 'club', label: 'Clube / Ponto de Encontro' },
          { value: 'facility', label: 'Instalação / Laboratório' },
          { value: 'supernatural_domain', label: 'Domínio Sobrenatural' },
          { value: 'battlemap', label: 'Battlemap / Tático' },
          { value: 'other', label: 'Outro' }
        ], defaultValue: 'building' },
        { name: 'district_region', label: 'Distrito / Região (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: Cidade Velha / Stare Mesto' },
        { name: 'narrative_address', label: 'Endereço Narrativo (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: Rua dos Alquimistas, nº 13' },
        { name: 'parent_location_id', label: 'Local Pai / Região Superior (Opcional)', type: 'fk_location', required: false, gridFull: false },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'public_description', label: 'Descrição Pública do Local (Opcional)', type: 'textarea', required: false, rows: 4, gridFull: true, placeholder: 'Arquitetura, atmosfera, iluminação e detalhes visíveis…' }
      ]
    },
    document: {
      label: 'Documento / Evidência',
      singular: 'Documento',
      newBtnLabel: '+ Novo Documento',
      allowCreate: true,
      allowUpdate: true,
      createMethod: 'createDocument',
      updateMethod: 'updateDocument',
      hasSlug: true,
      slugSource: 'title',
      coverField: 'image_path',
      coverBucket: 'documents',
      fields: [
        { name: 'title', label: 'Título do Documento *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Carta Interceptada' },
        { name: 'slug', label: 'Slug (Identificador URL) *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: carta-interceptada' },
        { name: 'type', label: 'Tipo de Documento *', type: 'select', required: true, gridFull: false, options: [
          { value: 'photograph', label: 'Fotografia' },
          { value: 'letter', label: 'Carta / Correspondência' },
          { value: 'report', label: 'Relatório' },
          { value: 'newspaper_clipping', label: 'Recorte de Jornal' },
          { value: 'official_record', label: 'Registro Oficial' },
          { value: 'clue', label: 'Pista Material' },
          { value: 'artifact', label: 'Artefato' },
          { value: 'audio_log', label: 'Registro de Áudio' },
          { value: 'other', label: 'Outro' }
        ], defaultValue: 'report' },
        { name: 'narrative_date', label: 'Data Narrativa / de Época (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: 14 de Novembro de 1923' },
        { name: 'found_in_session_id', label: 'Encontrado na Sessão (Opcional)', type: 'fk_session', required: false, gridFull: false },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'public_description', label: 'Descrição Visual / Estado Físico (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Papel amarelado com manchas de cera e selo rompido…' },
        { name: 'transcription', label: 'Transcrição do Conteúdo (Opcional)', type: 'textarea', required: false, rows: 6, gridFull: true, placeholder: 'Texto integral transcrito do documento…' }
      ]
    },
    library: {
      label: 'Item da Biblioteca',
      singular: 'Item da Biblioteca',
      newBtnLabel: null, // CREATE bloqueado nesta fase pois library_items.file_path é NOT NULL e requer upload
      allowCreate: false,
      allowUpdate: true,
      createMethod: 'createLibraryItem',
      updateMethod: 'updateLibraryItem',
      hasSlug: true,
      slugSource: 'title',
      coverField: 'cover_path',
      coverBucket: 'library',
      fields: [
        { name: 'title', label: 'Título do Livro / Manual *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Mago: A Ascensão — Livro Básico' },
        { name: 'slug', label: 'Slug (Identificador URL) *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: mago-ascensao-basico' },
        { name: 'category', label: 'Categoria da Biblioteca *', type: 'select', required: true, gridFull: false, options: [
          { value: 'system_book', label: 'Livro do Sistema' },
          { value: 'pocket_manual', label: 'Manual de Bolso' },
          { value: 'quick_guide', label: 'Guia Rápido' },
          { value: 'character_sheet', label: 'Ficha de Personagem' },
          { value: 'supplement', label: 'Suplemento' },
          { value: 'extra', label: 'Material Extra' }
        ], defaultValue: 'system_book' },
        { name: 'version', label: 'Versão da Regra / Edição (Opcional)', type: 'text', required: false, gridFull: false, placeholder: 'Ex: 20th Anniversary Edition' },
        { name: 'page_count', label: 'Número de Páginas (Opcional)', type: 'number', required: false, min: 1, step: 1, gridFull: false, placeholder: 'Ex: 580' },
        { name: 'file_size_bytes', label: 'Tamanho em Bytes (Opcional)', type: 'number', required: false, min: 0, step: 1, gridFull: false, placeholder: 'Ex: 52428800' },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'description', label: 'Descrição / Detalhes do Tomo (Opcional)', type: 'textarea', required: false, rows: 4, gridFull: true, placeholder: 'Informações sobre a edição, sumário e uso em jogo…' }
      ]
    },
    soundtrack: {
      label: 'Trilha Sonora',
      singular: 'Trilha Sonora',
      newBtnLabel: '+ Nova Trilha',
      allowCreate: true,
      allowUpdate: true,
      createMethod: 'createSoundtrack',
      updateMethod: 'updateSoundtrack',
      hasSlug: false,
      coverField: null,
      coverBucket: null,
      fields: [
        { name: 'title', label: 'Título da Trilha Sonora *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: Tema de Tensão Oculta' },
        { name: 'youtube_url', label: 'Link do YouTube *', type: 'text', required: true, gridFull: false, placeholder: 'Ex: https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { name: 'category', label: 'Categoria Musical *', type: 'select', required: true, gridFull: false, options: [
          { value: 'theme', label: 'Tema Principal' },
          { value: 'investigation', label: 'Investigação' },
          { value: 'horror', label: 'Horror / Tensão' },
          { value: 'combat', label: 'Combate' },
          { value: 'suspense', label: 'Suspense' },
          { value: 'epilogue', label: 'Epílogo / Encerramento' },
          { value: 'ambient', label: 'Ambientação Geral' }
        ], defaultValue: 'ambient' },
        { name: 'active', label: 'Trilha Ativa na Campanha *', type: 'select', required: true, gridFull: false, options: [
          { value: 'true', label: 'Sim (Ativa)' },
          { value: 'false', label: 'Não (Inativa)' }
        ], defaultValue: 'true' },
        { name: 'sort_order', label: 'Ordem de Exibição (sort_order) *', type: 'number', required: true, gridFull: false, step: 1, defaultValue: '0' },
        { name: 'description', label: 'Descrição / Cenário de Uso (Opcional)', type: 'textarea', required: false, rows: 3, gridFull: true, placeholder: 'Quando tocar esta música durante a crônica…' }
      ]
    }
  });

  /**
   * Helper seguro de criação de elementos DOM (Safe DOM).
   */
  function createEl(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined && textContent !== null) el.textContent = String(textContent);
    return el;
  }

  /**
   * Helper para normalização segura de Slug.
   */
  function slugify(text) {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9\s-]/g, '')     // remove caracteres especiais
      .trim()
      .replace(/[\s_]+/g, '-')         // espaços e underscores viram traço
      .replace(/-+/g, '-');            // múltiplos traços viram um só
  }

  /**
   * Ponto de entrada chamado pelo Router ao carregar #/narrator.
   */
  async function load() {
    const container = document.getElementById('narrator-panel-container');
    if (!container) return;

    const user = window.ChronusAuth?.getUser();
    const profile = window.ChronusAuth?.getProfile();

    // Validação de Role: Exclusivo Narrador
    if (!user || profile?.role !== 'narrator') {
      container.innerHTML = '';
      const errorBox = createEl('div', 'editorial-box error-state');
      const title = createEl('h3', null, 'Acesso Restrito');
      const desc = createEl('p', null, 'Esta área é exclusiva do Narrador da crônica.');
      errorBox.appendChild(title);
      errorBox.appendChild(desc);
      container.appendChild(errorBox);
      return;
    }

    renderShellLayout(container);
  }

  /**
   * Renderiza a moldura do painel com a subnavegação principal.
   */
  function renderShellLayout(container) {
    container.innerHTML = '';

    // Cabeçalho e Subnavegação Principal
    const mainHeader = createEl('div', 'narrator-top-navigation');
    const tabList = createEl('div', 'narrator-main-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Subnavegação do Narrador');

    const btnPlayers = createEl('button', `narrator-tab-btn ${activeMainTab === 'players' ? 'is-active' : ''}`);
    btnPlayers.type = 'button';
    btnPlayers.id = 'tab-btn-players';
    btnPlayers.setAttribute('role', 'tab');
    btnPlayers.setAttribute('aria-selected', activeMainTab === 'players' ? 'true' : 'false');
    btnPlayers.setAttribute('aria-controls', 'narrator-pane-players');
    btnPlayers.textContent = '👥 Mesa de Jogadores';

    const btnEditorial = createEl('button', `narrator-tab-btn ${activeMainTab === 'editorial' ? 'is-active' : ''}`);
    btnEditorial.type = 'button';
    btnEditorial.id = 'tab-btn-editorial';
    btnEditorial.setAttribute('role', 'tab');
    btnEditorial.setAttribute('aria-selected', activeMainTab === 'editorial' ? 'true' : 'false');
    btnEditorial.setAttribute('aria-controls', 'narrator-pane-editorial');
    btnEditorial.textContent = '🏛️ Gestão Editorial';

    tabList.appendChild(btnPlayers);
    tabList.appendChild(btnEditorial);
    mainHeader.appendChild(tabList);
    container.appendChild(mainHeader);

    // Contêineres de cada Aba
    const panePlayers = createEl('div', `narrator-pane ${activeMainTab === 'players' ? 'is-visible' : 'is-hidden'}`);
    panePlayers.id = 'narrator-pane-players';
    panePlayers.setAttribute('role', 'tabpanel');
    panePlayers.setAttribute('aria-labelledby', 'tab-btn-players');

    const paneEditorial = createEl('div', `narrator-pane ${activeMainTab === 'editorial' ? 'is-visible' : 'is-hidden'}`);
    paneEditorial.id = 'narrator-pane-editorial';
    paneEditorial.setAttribute('role', 'tabpanel');
    paneEditorial.setAttribute('aria-labelledby', 'tab-btn-editorial');

    container.appendChild(panePlayers);
    container.appendChild(paneEditorial);

    // Eventos de troca de aba principal com proteção de Dirty State
    btnPlayers.addEventListener('click', () => {
      if (checkUnsavedFormChanges()) return;
      switchMainTab('players');
    });
    btnEditorial.addEventListener('click', () => {
      if (checkUnsavedFormChanges()) return;
      switchMainTab('editorial');
    });

    // Renderizar o conteúdo da aba ativa
    if (activeMainTab === 'players') {
      renderPlayerTable(panePlayers);
    } else {
      renderEditorialShell(paneEditorial);
    }
  }

  function checkUnsavedFormChanges() {
    if (isEditing && formIsDirty) {
      return !window.confirm('Existem alterações não salvas no formulário. Deseja realmente descartá-las?');
    }
    return false;
  }

  /**
   * Alterna entre Mesa de Jogadores e Gestão Editorial sem alterar a URL hash.
   */
  function switchMainTab(tab) {
    if (activeMainTab === tab) return;
    activeMainTab = tab;
    currentCmsRequestId++; // Invalida qualquer request assíncrono pendente
    isEditing = false;
    formIsDirty = false;

    const container = document.getElementById('narrator-panel-container');
    if (container) {
      renderShellLayout(container);
    }
  }

  /* ==========================================================================
     1. MESA DE JOGADORES (Legado 100% Preservado)
     ========================================================================== */

  async function renderPlayerTable(targetPane) {
    const pane = targetPane || document.getElementById('narrator-pane-players');
    if (!pane) return;

    pane.innerHTML = `
      <div class="dashboard-loading">
        <div class="spinner-occult"></div>
        <p>Carregando fichas dos jogadores da mesa…</p>
      </div>
    `;

    try {
      const client = window.ChronusSupabase.getClient();

      // 1. Buscar todos os jogadores registrados
      const { data: players, error: playersErr } = await client
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('role', 'player')
        .order('display_name', { ascending: true });

      if (playersErr) throw playersErr;

      // 2. Buscar as fichas mais recentes desses jogadores
      const playerIds = (players || []).map(p => p.id);
      let characters = [];
      if (playerIds.length > 0) {
        const { data: chars, error: charsErr } = await client
          .from('characters')
          .select('id, user_id, name, data, updated_at')
          .in('user_id', playerIds)
          .order('updated_at', { ascending: false });
        if (charsErr) throw charsErr;
        characters = chars || [];
      }

      const newestByUser = new Map();
      for (const c of characters) {
        if (!newestByUser.has(c.user_id)) {
          newestByUser.set(c.user_id, c);
        }
      }

      renderNarratorGrid(players || [], newestByUser, pane);
    } catch (err) {
      console.error('CHRONUS: Erro ao carregar painel do narrador:', err);
      pane.innerHTML = `
        <div class="editorial-box error-state">
          <h3>Não foi possível carregar as fichas</h3>
          <p>${err.message || 'Erro de conexão com o banco de dados.'}</p>
          <button type="button" class="portal-btn" id="btn-retry-players">Atualizar Fichas</button>
        </div>
      `;
      document.getElementById('btn-retry-players')?.addEventListener('click', () => renderPlayerTable(pane));
    }
  }

  function renderNarratorGrid(players, newestByUser, pane) {
    if (!pane) return;

    if (players.length === 0) {
      pane.innerHTML = `
        <div class="editorial-box">
          <h3>Nenhum jogador registrado</h3>
          <p>Nenhum perfil com o papel 'player' foi encontrado no banco de dados.</p>
        </div>
      `;
      return;
    }

    const cardsHtml = players.map(player => {
      const character = newestByUser.get(player.id) || null;
      const safePlayerName = player.display_name || player.email?.split('@')[0] || 'Jogador';
      const charName = character?.name || 'Ficha ainda não iniciada';
      const concept = character?.data?.identity?.concept ? `"${character.data.identity.concept}"` : 'Sem conceito';
      const tradition = character?.data?.identity?.tradition || 'Tradição não definida';

      let syncBadge = '<span class="status-pill status-empty">Aguardando 1º login</span>';
      let syncDateStr = 'Nunca';

      if (character) {
        const diffMs = Date.now() - new Date(character.updated_at).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMin / 60);

        if (diffMin < 10) {
          syncBadge = '<span class="status-pill status-online">● Online / Recente</span>';
        } else if (diffHours < 24) {
          syncBadge = `<span class="status-pill status-synced">✓ Sincronizado (${diffHours}h atrás)</span>`;
        } else {
          syncBadge = `<span class="status-pill status-stale">⚠ Desatualizado (${Math.floor(diffHours / 24)}d atrás)</span>`;
        }
        syncDateStr = new Date(character.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      }

      return `
        <article class="narrator-player-card" data-user-id="${player.id}">
          <div class="card-head">
            <div class="player-avatar-mini" id="narrator-avatar-${player.id}">
              <span>🛡️</span>
            </div>
            <div class="player-titles">
              <h3 class="player-name-title">${safePlayerName}</h3>
              <span class="player-email-sub">${player.email || ''}</span>
            </div>
          </div>

          <div class="card-body">
            <div class="char-highlight-block">
              <div class="char-highlight-name">${charName}</div>
              <div class="char-highlight-sub">${tradition} • ${concept}</div>
            </div>
            <div class="sync-row">
              <span class="sync-label">Status:</span>
              ${syncBadge}
            </div>
            <div class="sync-row">
              <span class="sync-label">Última atualização:</span>
              <span class="sync-time">${syncDateStr}</span>
            </div>
          </div>

          <div class="card-footer">
            ${character ? `
              <button type="button" class="portal-btn portal-btn-gold btn-open-readonly-sheet" 
                data-player-id="${player.id}"
                data-player-name="${safePlayerName}"
                data-char-id="${character.id}"
                data-char-name="${charName}">
                Abrir Ficha (Somente Leitura)
              </button>
            ` : `
              <button type="button" class="portal-btn" disabled>Aguardando Criação</button>
            `}
          </div>
        </article>
      `;
    }).join('');

    pane.innerHTML = `
      <div class="narrator-shell-header">
        <div>
          <h2 class="narrator-main-title">Cabala de Jogadores (Mesa Ativa)</h2>
          <p class="narrator-subtitle-desc">
            Acompanhe o estado das fichas em tempo real. O acesso do Narrador é estritamente <strong>somente leitura</strong>: 
            os jogadores são os únicos com permissão de edição em seus respectivos registros.
          </p>
        </div>
        <button type="button" class="portal-btn portal-btn-secondary" id="btn-narrator-refresh">
          🔄 Atualizar Mesa
        </button>
      </div>

      <div class="narrator-players-grid">
        ${cardsHtml}
      </div>
    `;

    document.getElementById('btn-narrator-refresh')?.addEventListener('click', () => renderPlayerTable(pane));

    // Bind botões "Abrir Ficha"
    pane.querySelectorAll('.btn-open-readonly-sheet').forEach(btn => {
      btn.addEventListener('click', () => {
        const playerId = btn.getAttribute('data-player-id');
        const playerName = btn.getAttribute('data-player-name');
        const charId = btn.getAttribute('data-char-id');
        const charName = btn.getAttribute('data-char-name');
        const character = newestByUser.get(playerId);

        if (character) {
          const cfg = window.CHRONUS_CONFIG;
          sessionStorage.setItem(cfg.NARRATOR_VIEW_DATA_KEY, JSON.stringify(character.data || {}));
          sessionStorage.setItem(cfg.NARRATOR_VIEW_META_KEY, JSON.stringify({
            user_id: playerId,
            player_name: playerName,
            character_id: charId,
            character_name: charName,
            updated_at: character.updated_at || ''
          }));
          window.location.hash = '#/sheet?narratorView=1';
        }
      });
    });

    // Carregar retratos para cada card
    players.forEach(p => loadPlayerPortrait(p.id));
  }

  async function loadPlayerPortrait(playerId) {
    const client = window.ChronusSupabase.getClient();
    const container = document.getElementById(`narrator-avatar-${playerId}`);
    if (!client || !container) return;

    try {
      const { data, error } = await client.storage.from('portraits').download(`${playerId}/portrait`);
      if (!error && data) {
        const url = URL.createObjectURL(data);
        container.innerHTML = `<img src="${url}" alt="Retrato" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      }
    } catch (e) {
      // Retrato opcional
    }
  }

  /* ==========================================================================
     2. GESTÃO EDITORIAL (CMS SHELL & FORM ENGINE UNIFICADO)
     ========================================================================== */

  /**
   * Renderiza a estrutura da Gestão Editorial.
   */
  function renderEditorialShell(targetPane) {
    const pane = targetPane || document.getElementById('narrator-pane-editorial');
    if (!pane) return;

    pane.innerHTML = '';

    // Cabeçalho da Gestão Editorial
    const headerWrapper = createEl('div', 'editorial-shell-header');
    const headerInfo = createEl('div');
    const title = createEl('h2', 'narrator-main-title', 'Gestão Editorial da Crônica');
    const subtitle = createEl('p', 'narrator-subtitle-desc', 'Visão administrativa e acervo da campanha. O acesso é exclusivo do Narrador para inspeção e edição de conteúdos.');
    headerInfo.appendChild(title);
    headerInfo.appendChild(subtitle);
    headerWrapper.appendChild(headerInfo);
    pane.appendChild(headerWrapper);

    // Feedback Toast se houver
    if (feedbackMessage) {
      const toast = createEl('div', 'editorial-feedback-toast', feedbackMessage);
      headerWrapper.appendChild(toast);
      setTimeout(() => {
        toast.hidden = true;
        if (toast.parentElement && typeof toast.parentElement.removeChild === 'function') {
          toast.parentElement.removeChild(toast);
        }
        feedbackMessage = null;
      }, 5000);
    }

    // Barra de Navegação das 7 Áreas + Dashboard
    const navBar = createEl('nav', 'editorial-nav-bar');
    navBar.setAttribute('role', 'tablist');
    navBar.setAttribute('aria-label', 'Navegação de Áreas Editoriais');

    const btnDash = createEl('button', `editorial-nav-btn ${activeEditorialSection === 'dashboard' ? 'is-active' : ''}`);
    btnDash.type = 'button';
    btnDash.setAttribute('role', 'tab');
    btnDash.setAttribute('aria-selected', activeEditorialSection === 'dashboard' ? 'true' : 'false');
    btnDash.textContent = '📊 Visão Geral';
    btnDash.addEventListener('click', () => {
      if (checkUnsavedFormChanges()) return;
      switchEditorialSection('dashboard');
    });
    navBar.appendChild(btnDash);

    EDITORIAL_SECTIONS.forEach(sec => {
      const btn = createEl('button', `editorial-nav-btn ${activeEditorialSection === sec.id ? 'is-active' : ''}`);
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', activeEditorialSection === sec.id ? 'true' : 'false');
      btn.textContent = `${sec.icon} ${sec.name}`;
      btn.addEventListener('click', () => {
        if (checkUnsavedFormChanges()) return;
        switchEditorialSection(sec.id);
      });
      navBar.appendChild(btn);
    });

    pane.appendChild(navBar);

    // Contêiner dinâmico da Seção Ativa
    const contentArea = createEl('div', 'editorial-content-area');
    contentArea.id = 'editorial-content-container';
    pane.appendChild(contentArea);

    // Carregar a visualização ativa
    if (activeEditorialSection === 'dashboard') {
      renderEditorialDashboard(contentArea);
    } else {
      renderEditorialSection(activeEditorialSection, contentArea);
    }
  }

  /**
   * Alterna a seção do CMS com proteção contra Stale Render e Dirty State.
   */
  function switchEditorialSection(sectionId) {
    if (activeEditorialSection === sectionId && !isEditing) return;
    activeEditorialSection = sectionId;
    isEditing = false;
    activeFormEntity = null;
    formIsDirty = false;
    currentSearchQuery = '';
    currentFilter = 'all';

    const pane = document.getElementById('narrator-pane-editorial');
    if (pane) {
      renderEditorialShell(pane);
    }
  }

  /**
   * Renderiza a Visão Geral (Dashboard) com contadores derivados com segurança.
   */
  async function renderEditorialDashboard(container) {
    const requestId = ++currentCmsRequestId;

    container.innerHTML = '';
    const loadingEl = createEl('div', 'dashboard-loading');
    const spinner = createEl('div', 'spinner-occult');
    const loadingText = createEl('p', null, 'Carregando resumo do acervo editorial…');
    loadingEl.appendChild(spinner);
    loadingEl.appendChild(loadingText);
    container.appendChild(loadingEl);

    try {
      // Buscar dados de todas as seções via ChronusContent em paralelo
      const [chapters, sessions, npcs, locations, documents, library, soundtrack] = await Promise.all([
        window.ChronusContent.getChapters({ limit: 100 }).catch(() => []),
        window.ChronusContent.getSessions({ limit: 100 }).catch(() => []),
        window.ChronusContent.getNpcs({ limit: 100 }).catch(() => []),
        window.ChronusContent.getLocations({ limit: 100 }).catch(() => []),
        window.ChronusContent.getDocuments({ limit: 100 }).catch(() => []),
        window.ChronusContent.getLibraryItems({ limit: 100 }).catch(() => []),
        window.ChronusContent.getSoundtrack({ limit: 100 }).catch(() => [])
      ]);

      // Proteção Stale Render: Validar requestId e rota ativa
      if (requestId !== currentCmsRequestId || !window.location.hash.startsWith('#/narrator')) {
        return;
      }

      // Atualizar cache em memória
      editorialCache = {
        chapter: chapters,
        session: sessions,
        npc: npcs,
        location: locations,
        document: documents,
        library: library,
        soundtrack: soundtrack
      };

      container.innerHTML = '';

      const grid = createEl('div', 'editorial-dashboard-grid');

      EDITORIAL_SECTIONS.forEach(sec => {
        const items = editorialCache[sec.id] || [];
        const total = items.length;
        const publishedCount = items.filter(it => it.published === true || Boolean(it.published_at)).length;
        const draftCount = total - publishedCount;

        const card = createEl('article', 'editorial-dash-card');
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Abrir seção ${sec.name}`);

        const header = createEl('div', 'dash-card-header');
        const icon = createEl('span', 'dash-card-icon', sec.icon);
        const name = createEl('h3', 'dash-card-title', sec.name);
        header.appendChild(icon);
        header.appendChild(name);
        card.appendChild(header);

        const desc = createEl('p', 'dash-card-desc', sec.desc);
        card.appendChild(desc);

        const statsRow = createEl('div', 'dash-card-stats');

        const statTotal = createEl('div', 'dash-stat');
        const numTotal = createEl('span', 'dash-stat-num', total);
        const lblTotal = createEl('span', 'dash-stat-label', 'Total');
        statTotal.appendChild(numTotal);
        statTotal.appendChild(lblTotal);

        const statPub = createEl('div', 'dash-stat stat-pub');
        const numPub = createEl('span', 'dash-stat-num', publishedCount);
        const lblPub = createEl('span', 'dash-stat-label', 'Publicados');
        statPub.appendChild(numPub);
        statPub.appendChild(lblPub);

        const statDraft = createEl('div', 'dash-stat stat-draft');
        const numDraft = createEl('span', 'dash-stat-num', draftCount);
        const lblDraft = createEl('span', 'dash-stat-label', 'Rascunhos');
        statDraft.appendChild(numDraft);
        statDraft.appendChild(lblDraft);

        statsRow.appendChild(statTotal);
        statsRow.appendChild(statPub);
        statsRow.appendChild(statDraft);
        card.appendChild(statsRow);

        const actionRow = createEl('div', 'dash-card-action');
        const link = createEl('span', 'dash-card-link', 'Explorar Seção →');
        actionRow.appendChild(link);
        card.appendChild(actionRow);

        // Click / Keypress para abrir a seção
        const openSection = () => switchEditorialSection(sec.id);
        card.addEventListener('click', openSection);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSection();
          }
        });

        grid.appendChild(card);
      });

      container.appendChild(grid);
    } catch (err) {
      if (requestId !== currentCmsRequestId || !window.location.hash.startsWith('#/narrator')) return;
      console.error('CHRONUS: Falha ao carregar dashboard editorial:', err);
      container.innerHTML = '';
      const errBox = createEl('div', 'editorial-box error-state');
      errBox.appendChild(createEl('h3', null, 'Não foi possível carregar o dashboard editorial.'));
      errBox.appendChild(createEl('p', null, 'Ocorreu uma falha na consulta dos registros.'));
      container.appendChild(errBox);
    }
  }

  /**
   * Renderiza a listagem ou formulário de uma das 7 seções editoriais.
   */
  async function renderEditorialSection(sectionId, container) {
    const requestId = ++currentCmsRequestId;
    const secConfig = EDITORIAL_SECTIONS.find(s => s.id === sectionId);
    if (!secConfig) return;

    container.innerHTML = '';

    // Se estiver em modo de formulário nesta entidade, renderiza o editor unificado
    if (isEditing && activeFormEntity === sectionId) {
      renderEditorialForm(sectionId, container);
      return;
    }

    const formConfig = EDITOR_FORM_CONFIG[sectionId];

    // Barra de Ferramentas / Toolbar (Busca, Filtros e Ação "+ Novo")
    const toolbar = createEl('div', 'editorial-toolbar');

    // Botão "+ Novo" (se permitido na configuração da entidade)
    if (formConfig && formConfig.allowCreate && formConfig.newBtnLabel) {
      const btnNew = createEl('button', 'portal-btn portal-btn-gold btn-new-editorial', formConfig.newBtnLabel);
      btnNew.type = 'button';
      btnNew.id = `btn-new-${sectionId}`;
      btnNew.setAttribute('aria-label', `Criar ${formConfig.singular.toLowerCase()}`);
      btnNew.addEventListener('click', () => openEditorialForm(sectionId, 'create'));
      toolbar.appendChild(btnNew);
    }

    // Campo de busca local
    const searchWrapper = createEl('div', 'editorial-search-wrapper');
    const searchInput = createEl('input', 'editorial-search-input');
    searchInput.type = 'text';
    searchInput.placeholder = `Buscar em ${secConfig.name}…`;
    searchInput.value = currentSearchQuery;
    searchInput.setAttribute('aria-label', `Buscar em ${secConfig.name}`);
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      applyLocalFilter(sectionId);
    });
    searchWrapper.appendChild(searchInput);
    toolbar.appendChild(searchWrapper);

    // Filtros de Publicação
    const filterPills = createEl('div', 'editorial-filter-pills');
    const filters = [
      { id: 'all', label: 'Todos' },
      { id: 'published', label: 'Publicados' },
      { id: 'draft', label: 'Rascunhos' }
    ];

    filters.forEach(f => {
      const btn = createEl('button', `editorial-filter-pill ${currentFilter === f.id ? 'is-active' : ''}`, f.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        currentFilter = f.id;
        filterPills.querySelectorAll('.editorial-filter-pill').forEach(p => p.classList.toggle('is-active', p === btn));
        applyLocalFilter(sectionId);
      });
      filterPills.appendChild(btn);
    });
    toolbar.appendChild(filterPills);
    container.appendChild(toolbar);

    // Contêiner da lista de itens
    const listWrapper = createEl('div', 'editorial-items-container');
    listWrapper.id = 'editorial-items-list';

    const loadingEl = createEl('div', 'dashboard-loading');
    loadingEl.appendChild(createEl('div', 'spinner-occult'));
    loadingEl.appendChild(createEl('p', null, `Carregando ${secConfig.name}…`));
    listWrapper.appendChild(loadingEl);
    container.appendChild(listWrapper);

    try {
      // Buscar dados via ChronusContent
      let items = [];
      if (sectionId === 'chapter') items = await window.ChronusContent.getChapters({ limit: 100 });
      else if (sectionId === 'session') items = await window.ChronusContent.getSessions({ limit: 100 });
      else if (sectionId === 'npc') items = await window.ChronusContent.getNpcs({ limit: 100 });
      else if (sectionId === 'location') items = await window.ChronusContent.getLocations({ limit: 100 });
      else if (sectionId === 'document') items = await window.ChronusContent.getDocuments({ limit: 100 });
      else if (sectionId === 'library') items = await window.ChronusContent.getLibraryItems({ limit: 100 });
      else if (sectionId === 'soundtrack') items = await window.ChronusContent.getSoundtrack({ limit: 100 });

      // Stale Render Guard
      if (requestId !== currentCmsRequestId || !window.location.hash.startsWith('#/narrator')) {
        return;
      }

      editorialCache[sectionId] = items || [];
      renderFilteredItems(sectionId, listWrapper);
    } catch (err) {
      if (requestId !== currentCmsRequestId || !window.location.hash.startsWith('#/narrator')) return;
      console.error(`CHRONUS: Falha ao buscar seção ${sectionId}:`, err);
      listWrapper.innerHTML = '';
      const errBox = createEl('div', 'editorial-box error-state');
      errBox.appendChild(createEl('h3', null, 'Não foi possível carregar esta seção.'));
      errBox.appendChild(createEl('p', null, 'Tente novamente mais tarde.'));
      listWrapper.appendChild(errBox);
    }
  }

  /**
   * Abre o editor unificado em modo 'create' ou 'edit' para qualquer uma das 7 entidades.
   */
  function openEditorialForm(entityKey, mode, item = null) {
    const config = EDITOR_FORM_CONFIG[entityKey];
    if (!config) return;

    activeFormEntity = entityKey;
    formMode = mode;
    editingRecordId = item ? item.id : null;
    isEditing = true;
    formIsDirty = false;
    formIsSubmitting = false;
    formIsSlugTouched = (mode === 'edit');

    // Inicialização segura dos valores do formulário
    formInitialValues = {};
    config.fields.forEach(f => {
      if (mode === 'edit' && item) {
        const val = item[f.name];
        if (val !== null && val !== undefined) {
          formInitialValues[f.name] = String(val);
        } else {
          formInitialValues[f.name] = '';
        }
      } else {
        formInitialValues[f.name] = f.defaultValue !== undefined ? String(f.defaultValue) : '';
      }
    });

    // Armazena caminho de capa existente se houver
    if (mode === 'edit' && item && config.coverField) {
      formInitialValues._coverPath = item[config.coverField] || null;
    }

    const container = document.getElementById('editorial-content-container');
    if (container) {
      renderEditorialForm(entityKey, container);
    }
  }

  /**
   * Renderiza o Formulário Unificado do CMS (Safe DOM).
   */
  function renderEditorialForm(entityKey, container) {
    const config = EDITOR_FORM_CONFIG[entityKey];
    if (!config) return;

    container.innerHTML = '';

    const formCard = createEl('div', 'editorial-form-card');

    // Cabeçalho do Formulário
    const formHeader = createEl('div', 'editorial-form-header');
    const titleText = formMode === 'create'
      ? `Novo Registro: ${config.label}`
      : `Editar ${config.singular}: ${formInitialValues.title || formInitialValues.name || 'Sem Título'}`;
    const formTitle = createEl('h3', 'editorial-form-title', titleText);
    const formDesc = createEl('p', 'editorial-form-desc', `Rascunho com acesso exclusivo do Narrador. O registro nasce despublicado e com visibilidade restrita.`);
    formHeader.appendChild(formTitle);
    formHeader.appendChild(formDesc);
    formCard.appendChild(formHeader);

    // Preview de Capa/Asset Read-Only se existir no Edit
    if (formMode === 'edit' && formInitialValues._coverPath && config.coverBucket) {
      const coverBox = createEl('div', 'form-cover-preview-box');
      const coverThumb = createEl('img', 'form-cover-thumb');
      coverThumb.alt = `Capa atual de ${config.singular}`;
      coverBox.appendChild(coverThumb);

      const coverNotice = createEl('p', 'form-cover-notice', 'Capa atual — o gerenciamento de imagem será liberado em etapa posterior.');
      coverBox.appendChild(coverNotice);
      formCard.appendChild(coverBox);

      window.ChronusAssets?.getSignedUrl(config.coverBucket, formInitialValues._coverPath)
        .then(url => { if (url) coverThumb.src = url; })
        .catch(() => {});
    }

    // Banner de Erros do Formulário
    const errorBanner = createEl('div', 'editorial-error-banner');
    errorBanner.id = 'editorial-form-error';
    errorBanner.hidden = true;
    formCard.appendChild(errorBanner);

    // Formulário
    const form = createEl('form', 'editorial-form');
    form.id = 'editorial-unified-form';
    form.noValidate = true;

    // Grid de Campos
    const grid = createEl('div', 'editorial-form-grid');
    const fieldElements = {};

    config.fields.forEach(f => {
      const grp = createEl('div', `form-group ${f.gridFull ? 'form-group-full' : ''}`);
      const fieldId = `field-${entityKey}-${f.name}`;

      const lbl = createEl('label', 'form-label', f.label);
      lbl.setAttribute('for', fieldId);
      grp.appendChild(lbl);

      let inputEl;

      if (f.type === 'textarea') {
        inputEl = createEl('textarea', 'form-control');
        inputEl.id = fieldId;
        inputEl.name = f.name;
        inputEl.rows = String(f.rows || 3);
        inputEl.value = formInitialValues[f.name] || '';
        if (f.placeholder) inputEl.placeholder = f.placeholder;
        if (f.required) inputEl.required = true;
      } else if (f.type === 'select') {
        inputEl = createEl('select', 'form-control');
        inputEl.id = fieldId;
        inputEl.name = f.name;
        inputEl.value = formInitialValues[f.name] || (f.options && f.options[0] ? f.options[0].value : '');
        if (f.required) inputEl.required = true;

        (f.options || []).forEach(opt => {
          const optEl = createEl('option', null, opt.label);
          optEl.value = opt.value;
          if (String(opt.value) === String(formInitialValues[f.name])) {
            optEl.selected = true;
          }
          inputEl.appendChild(optEl);
        });
      } else if (f.type === 'fk_session') {
        inputEl = createEl('select', 'form-control');
        inputEl.id = fieldId;
        inputEl.name = f.name;
        inputEl.value = formInitialValues[f.name] || '';

        const emptyOpt = createEl('option', null, '-- Nenhuma Sessão (Opcional) --');
        emptyOpt.value = '';
        inputEl.appendChild(emptyOpt);

        const sessions = editorialCache.session || [];
        sessions.forEach(s => {
          const optEl = createEl('option', null, `Sessão #${s.session_number}: ${s.title}`);
          optEl.value = s.id;
          if (String(s.id) === String(formInitialValues[f.name])) {
            optEl.selected = true;
          }
          inputEl.appendChild(optEl);
        });
      } else if (f.type === 'fk_location') {
        inputEl = createEl('select', 'form-control');
        inputEl.id = fieldId;
        inputEl.name = f.name;
        inputEl.value = formInitialValues[f.name] || '';

        const emptyOpt = createEl('option', null, '-- Nenhum Local Pai (Opcional) --');
        emptyOpt.value = '';
        inputEl.appendChild(emptyOpt);

        const locations = editorialCache.location || [];
        locations.forEach(l => {
          if (formMode === 'edit' && editingRecordId === l.id) return; // Não vincula o local a si mesmo
          const optEl = createEl('option', null, `${l.name} (${l.type || 'Local'})`);
          optEl.value = l.id;
          if (String(l.id) === String(formInitialValues[f.name])) {
            optEl.selected = true;
          }
          inputEl.appendChild(optEl);
        });
      } else {
        inputEl = createEl('input', 'form-control');
        inputEl.type = f.type || 'text';
        inputEl.id = fieldId;
        inputEl.name = f.name;
        inputEl.value = formInitialValues[f.name] || '';
        if (f.placeholder) inputEl.placeholder = f.placeholder;
        if (f.min !== undefined) inputEl.min = String(f.min);
        if (f.step !== undefined) inputEl.step = String(f.step);
        if (f.required) inputEl.required = true;
      }

      grp.appendChild(inputEl);
      grid.appendChild(grp);
      fieldElements[f.name] = inputEl;

      // Eventos de Dirty State e Auto-Slug
      inputEl.addEventListener('input', () => {
        formIsDirty = true;
        if (config.hasSlug && f.name === config.slugSource && formMode === 'create' && !formIsSlugTouched) {
          const slugInput = fieldElements.slug;
          if (slugInput) {
            slugInput.value = slugify(inputEl.value);
          }
        }
        if (f.name === 'slug') {
          formIsSlugTouched = true;
        }
      });
      inputEl.addEventListener('change', () => {
        formIsDirty = true;
      });
    });

    form.appendChild(grid);

    // Barra de Ações (Salvar e Cancelar)
    const actionsRow = createEl('div', 'form-actions-row');

    const btnSave = createEl('button', 'portal-btn portal-btn-gold', `💾 Salvar ${config.singular}`);
    btnSave.type = 'submit';
    btnSave.id = 'btn-editorial-save';

    const btnCancel = createEl('button', 'portal-btn portal-btn-secondary', 'Cancelar');
    btnCancel.type = 'button';
    btnCancel.id = 'btn-editorial-cancel';

    actionsRow.appendChild(btnSave);
    actionsRow.appendChild(btnCancel);
    form.appendChild(actionsRow);

    formCard.appendChild(form);
    container.appendChild(formCard);

    // Foco no primeiro campo
    const firstFieldName = config.fields[0]?.name;
    if (firstFieldName && fieldElements[firstFieldName]) {
      setTimeout(() => fieldElements[firstFieldName].focus(), 50);
    }

    // Handler de Cancelar
    btnCancel.addEventListener('click', () => {
      if (formIsDirty && !window.confirm('Deseja descartar as alterações não salvas?')) {
        return;
      }
      isEditing = false;
      activeFormEntity = null;
      formIsDirty = false;
      renderEditorialSection(entityKey, container);
    });

    // Handler de Submit Unificado
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (formIsSubmitting) return; // Proteção contra Double Submit

      errorBanner.hidden = true;
      errorBanner.textContent = '';

      // Validação defensiva client-side
      const collectedValues = {};
      let validationError = null;
      let fieldToFocus = null;

      for (const f of config.fields) {
        const inputEl = fieldElements[f.name];
        const val = inputEl ? inputEl.value.trim() : '';

        if (f.required && !val) {
          validationError = `${f.label.replace(' *', '')} é obrigatório.`;
          fieldToFocus = inputEl;
          break;
        }

        if (f.type === 'number') {
          if (val !== '') {
            const num = Number(val);
            if (!Number.isInteger(num)) {
              validationError = `${f.label.replace(' *', '')} deve ser um número inteiro válido.`;
              fieldToFocus = inputEl;
              break;
            }
            if (f.min !== undefined && num < f.min) {
              validationError = `${f.label.replace(' *', '')} deve ser no mínimo ${f.min}.`;
              fieldToFocus = inputEl;
              break;
            }
            collectedValues[f.name] = num;
          } else {
            collectedValues[f.name] = null;
          }
        } else if (f.name === 'active' && entityKey === 'soundtrack') {
          collectedValues[f.name] = (val === 'true');
        } else if (f.type === 'fk_session' || f.type === 'fk_location') {
          collectedValues[f.name] = val ? val : null;
        } else if (f.type === 'date') {
          collectedValues[f.name] = val ? val : null;
        } else {
          collectedValues[f.name] = val ? val : null;
        }
      }

      if (validationError) {
        showFormError(errorBanner, fieldToFocus, validationError);
        return;
      }

      // Bloqueio de Double Submit
      formIsSubmitting = true;
      btnSave.disabled = true;
      btnSave.textContent = 'Salvando…';

      try {
        let result;

        if (formMode === 'create') {
          // PAYLOAD CREATE: Fixa visibility='narrator' e published=false
          const payload = {
            ...collectedValues,
            visibility: 'narrator',
            published: false
          };
          result = await window.ChronusEditorial[config.createMethod](payload);
        } else {
          // PATCH UPDATE: Envia somente campos editáveis (NUNCA envia id, timestamps ou publication)
          result = await window.ChronusEditorial[config.updateMethod](editingRecordId, collectedValues);
        }

        // Stale Guard
        if (!window.location.hash.startsWith('#/narrator')) {
          formIsSubmitting = false;
          return;
        }

        if (result && result.ok) {
          formIsSubmitting = false;
          isEditing = false;
          activeFormEntity = null;
          formIsDirty = false;
          feedbackMessage = formMode === 'create'
            ? `✓ ${config.singular} criado com sucesso como rascunho.`
            : `✓ ${config.singular} atualizado com sucesso.`;

          // Recarrega o painel da Gestão Editorial
          const pane = document.getElementById('narrator-pane-editorial');
          if (pane) {
            renderEditorialShell(pane);
          }
        } else {
          // Tratamento de Erro Padronizado
          formIsSubmitting = false;
          btnSave.disabled = false;
          btnSave.textContent = `💾 Salvar ${config.singular}`;

          const errorMsg = mapEditorialError(result?.code, result?.message, config.singular);
          showFormError(errorBanner, null, errorMsg);
        }
      } catch (err) {
        formIsSubmitting = false;
        btnSave.disabled = false;
        btnSave.textContent = `💾 Salvar ${config.singular}`;
        showFormError(errorBanner, null, `Ocorreu um erro inesperado ao salvar ${config.singular.toLowerCase()}.`);
      }
    });
  }

  function showFormError(errorBanner, fieldToFocus, message) {
    if (!errorBanner) return;
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    if (fieldToFocus) {
      fieldToFocus.setAttribute('aria-invalid', 'true');
      fieldToFocus.focus();
    } else {
      errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function mapEditorialError(code, rawMsg, singularLabel) {
    if (code === 'CONFLICT') {
      return `Já existe um registro com este slug ou identificador.`;
    }
    if (code === 'INVALID_INPUT' || code === 'INVALID_FIELD') {
      return `Revise os campos informados. Alguns dados estão inválidos.`;
    }
    if (code === 'NOT_NARRATOR') {
      return 'Sua sessão não possui permissão de Narrador.';
    }
    if (code === 'RLS_DENIED') {
      return 'A operação foi bloqueada pelas regras de segurança do servidor.';
    }
    return rawMsg || `Não foi possível salvar o registro no banco de dados.`;
  }

  /**
   * Aplica busca e filtro local sobre os dados em cache.
   */
  function applyLocalFilter(sectionId) {
    const listWrapper = document.getElementById('editorial-items-list');
    if (!listWrapper) return;
    renderFilteredItems(sectionId, listWrapper);
  }

  /**
   * Renderiza os itens filtrados com Safe DOM.
   */
  function renderFilteredItems(sectionId, listWrapper) {
    listWrapper.innerHTML = '';
    const secConfig = EDITORIAL_SECTIONS.find(s => s.id === sectionId);
    let items = editorialCache[sectionId] || [];

    // 1. Filtro de Publicação
    if (currentFilter === 'published') {
      items = items.filter(it => it.published === true || Boolean(it.published_at));
    } else if (currentFilter === 'draft') {
      items = items.filter(it => it.published === false || (!it.published && !it.published_at));
    }

    // 2. Filtro de Busca (case-insensitive)
    if (currentSearchQuery && currentSearchQuery.trim()) {
      const q = currentSearchQuery.trim().toLowerCase();
      items = items.filter(it => {
        const titleText = (it.title || it.name || '').toLowerCase();
        const subText = (it.subtitle || it.summary || it.role_occupation || it.type || it.category || '').toLowerCase();
        return titleText.includes(q) || subText.includes(q);
      });
    }

    // Empty State
    if (items.length === 0) {
      const emptyBox = createEl('div', 'editorial-empty-box');
      const emptyIcon = createEl('span', 'editorial-empty-icon', '📭');
      const emptyMsg = createEl('p', 'editorial-empty-msg', currentSearchQuery ? 'Nenhum resultado encontrado para a busca.' : (secConfig?.emptyMsg || 'Nenhum registro encontrado.'));
      emptyBox.appendChild(emptyIcon);
      emptyBox.appendChild(emptyMsg);
      listWrapper.appendChild(emptyBox);
      return;
    }

    // Grid de Itens
    const grid = createEl('div', 'editorial-items-grid');

    items.forEach(item => {
      const card = renderItemCard(sectionId, item);
      grid.appendChild(card);
    });

    listWrapper.appendChild(grid);
  }

  /**
   * Constrói o card individual de um item editorial (Safe DOM).
   */
  function renderItemCard(sectionId, item) {
    const card = createEl('article', 'editorial-item-card');
    const formConfig = EDITOR_FORM_CONFIG[sectionId];

    // Cabeçalho do Card
    const header = createEl('div', 'editorial-item-header');

    // Preview / Ícone do card
    const mediaContainer = createEl('div', 'editorial-item-media');
    const fallbackIcon = createEl('span', 'editorial-card-fallback-icon', getSectionDefaultIcon(sectionId));
    mediaContainer.appendChild(fallbackIcon);

    const imgEl = createEl('img', 'editorial-card-thumb');
    imgEl.hidden = true;
    imgEl.alt = 'Imagem do registro';
    mediaContainer.appendChild(imgEl);
    header.appendChild(mediaContainer);

    // Carregamento de imagem segura via ChronusAssets
    resolveItemImage(sectionId, item, imgEl, fallbackIcon);

    // Informações principais (Título e Subtítulo)
    const titlesCol = createEl('div', 'editorial-item-titles');
    const mainTitleText = item.title || item.name || 'Sem título';
    const mainTitle = createEl('h4', 'editorial-item-title', mainTitleText);
    titlesCol.appendChild(mainTitle);

    const subtitleText = getSubtitleText(sectionId, item);
    if (subtitleText) {
      const subtitle = createEl('span', 'editorial-item-subtitle', subtitleText);
      titlesCol.appendChild(subtitle);
    }
    header.appendChild(titlesCol);
    card.appendChild(header);

    // Corpo do Card (Resumo / Descrição)
    const body = createEl('div', 'editorial-item-body');
    const descText = item.summary || item.public_description || item.description || item.known_personality || null;
    if (descText) {
      const desc = createEl('p', 'editorial-item-desc', descText);
      body.appendChild(desc);
    }
    card.appendChild(body);

    // Rodapé do Card com Badges Padronizados e Ações
    const footer = createEl('div', 'editorial-item-footer');
    const badgesRow = createEl('div', 'editorial-item-badges');

    // 1. Badge de Publicação
    const isPublished = Boolean(item.published === true || item.published_at);
    const pubBadge = createEl('span', `editorial-badge ${isPublished ? 'badge-published' : 'badge-draft'}`, isPublished ? '● Publicado' : '○ Rascunho');
    badgesRow.appendChild(pubBadge);

    // 2. Badge de Visibilidade
    const vis = item.visibility || (isPublished ? 'public' : 'narrator');
    let visClass = 'badge-vis-narrator';
    let visLabel = '🔒 Narrador';
    if (vis === 'public') {
      visClass = 'badge-vis-public';
      visLabel = '🌐 Público';
    } else if (vis === 'players') {
      visClass = 'badge-vis-players';
      visLabel = '👥 Jogadores';
    }
    const visBadge = createEl('span', `editorial-badge ${visClass}`, visLabel);
    badgesRow.appendChild(visBadge);

    // 3. Badge de Ordem
    if (item.sort_order !== undefined && item.sort_order !== null) {
      const orderBadge = createEl('span', 'editorial-badge badge-order', `#${item.sort_order}`);
      badgesRow.appendChild(orderBadge);
    }

    // 4. Badges Específicos por Entidade
    if (sectionId === 'session' && item.status) {
      const statusBadge = createEl('span', 'editorial-badge badge-status', item.status);
      badgesRow.appendChild(statusBadge);
    } else if (sectionId === 'soundtrack') {
      if (item.active !== undefined) {
        const activeBadge = createEl('span', `editorial-badge ${item.active ? 'badge-active' : 'badge-inactive'}`, item.active ? 'Ativa' : 'Inativa');
        badgesRow.appendChild(activeBadge);
      }
      if (item.youtube_url) {
        const ytBadge = createEl('span', 'editorial-badge badge-yt-config', '🎵 Link configurado');
        badgesRow.appendChild(ytBadge);
      }
    }

    footer.appendChild(badgesRow);

    // BOTÃO EDITAR (Disponível em todas as entidades com allowUpdate = true)
    if (formConfig && formConfig.allowUpdate) {
      const cardActions = createEl('div', 'editorial-card-actions');
      const btnEdit = createEl('button', 'portal-btn portal-btn-secondary btn-edit-editorial', '✏️ Editar');
      btnEdit.type = 'button';
      btnEdit.setAttribute('aria-label', `Editar ${mainTitleText}`);
      btnEdit.addEventListener('click', () => openEditorialForm(sectionId, 'edit', item));
      cardActions.appendChild(btnEdit);
      footer.appendChild(cardActions);
    }

    card.appendChild(footer);

    return card;
  }

  function getSectionDefaultIcon(sectionId) {
    const sec = EDITORIAL_SECTIONS.find(s => s.id === sectionId);
    return sec ? sec.icon : '📄';
  }

  function getSubtitleText(sectionId, item) {
    if (sectionId === 'chapter') {
      const num = item.chapter_number ? `Capítulo ${item.chapter_number}` : '';
      const sub = item.subtitle ? ` — ${item.subtitle}` : '';
      return num + sub;
    }
    if (sectionId === 'session') {
      const num = item.session_number ? `Sessão #${item.session_number}` : '';
      const dt = item.session_date ? ` (${item.session_date})` : '';
      return num + dt;
    }
    if (sectionId === 'npc') {
      const role = item.role_occupation || 'Sem ocupação';
      const fac = item.faction ? ` • ${item.faction}` : '';
      return role + fac;
    }
    if (sectionId === 'location') {
      const type = item.type || 'Local';
      const reg = item.district_region ? ` • ${item.district_region}` : '';
      return type + reg;
    }
    if (sectionId === 'document') {
      const type = item.type || 'Documento';
      const dt = item.narrative_date ? ` • ${item.narrative_date}` : '';
      return type + dt;
    }
    if (sectionId === 'library') {
      const cat = item.category || 'Manual';
      const ver = item.version ? ` (v${item.version})` : '';
      return cat + ver;
    }
    if (sectionId === 'soundtrack') {
      return item.category || 'Trilha Geral';
    }
    return '';
  }

  /**
   * Resolve a URL assinada de imagem usando ChronusAssets de forma segura.
   * REGRA DE SEGURANÇA: Documentos e Biblioteca NUNCA assinam file_path.
   */
  async function resolveItemImage(sectionId, item, imgEl, fallbackIcon) {
    let bucket = null;
    let path = null;

    if (sectionId === 'chapter' && item.cover_image_path) {
      bucket = 'campaign-images';
      path = item.cover_image_path;
    } else if (sectionId === 'session' && item.cover_image_path) {
      bucket = 'campaign-images';
      path = item.cover_image_path;
    } else if (sectionId === 'npc' && item.portrait_path) {
      bucket = 'campaign-images';
      path = item.portrait_path;
    } else if (sectionId === 'location' && (item.image_path || item.map_image_path)) {
      bucket = 'maps';
      path = item.image_path || item.map_image_path;
    } else if (sectionId === 'document' && item.image_path) {
      bucket = 'documents';
      path = item.image_path; // Apenas o preview gráfico, NUNCA file_path
    } else if (sectionId === 'library' && item.cover_path) {
      bucket = 'library';
      path = item.cover_path; // Apenas a capa, NUNCA file_path
    }

    if (!bucket || !path) return;

    try {
      const signedUrl = await window.ChronusAssets?.getSignedUrl(bucket, path);
      if (signedUrl && typeof signedUrl === 'string') {
        imgEl.src = signedUrl;
        imgEl.hidden = false;
        if (fallbackIcon) fallbackIcon.hidden = true;
      }
    } catch (e) {
      // Falha silenciosa: o fallbackIcon continua visível
    }
  }

  return {
    load
  };
})();
