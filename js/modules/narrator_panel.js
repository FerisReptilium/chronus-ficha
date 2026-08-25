/**
 * CHRONUS — Narrator Panel Module (v2C.3)
 * Painel administrativo unificado do Narrador:
 * 1. Mesa de Jogadores (Fichas em tempo real somente leitura)
 * 2. Gestão Editorial (Shell visual read-only para as 7 áreas de conteúdo)
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

    // Eventos de troca de aba principal
    btnPlayers.addEventListener('click', () => switchMainTab('players'));
    btnEditorial.addEventListener('click', () => switchMainTab('editorial'));

    // Renderizar o conteúdo da aba ativa
    if (activeMainTab === 'players') {
      renderPlayerTable(panePlayers);
    } else {
      renderEditorialShell(paneEditorial);
    }
  }

  /**
   * Alterna entre Mesa de Jogadores e Gestão Editorial sem alterar a URL hash.
   */
  function switchMainTab(tab) {
    if (activeMainTab === tab) return;
    activeMainTab = tab;
    currentCmsRequestId++; // Invalida qualquer request assíncrono pendente

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
     2. GESTÃO EDITORIAL (CMS READ-ONLY SHELL)
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
    const subtitle = createEl('p', 'narrator-subtitle-desc', 'Visão administrativa e acervo da campanha. O acesso é exclusivo do Narrador para inspeção de conteúdos públicos, de jogadores e rascunhos.');
    headerInfo.appendChild(title);
    headerInfo.appendChild(subtitle);
    headerWrapper.appendChild(headerInfo);
    pane.appendChild(headerWrapper);

    // Barra de Navegação das 7 Áreas + Dashboard
    const navBar = createEl('nav', 'editorial-nav-bar');
    navBar.setAttribute('role', 'tablist');
    navBar.setAttribute('aria-label', 'Navegação de Áreas Editoriais');

    const btnDash = createEl('button', `editorial-nav-btn ${activeEditorialSection === 'dashboard' ? 'is-active' : ''}`);
    btnDash.type = 'button';
    btnDash.setAttribute('role', 'tab');
    btnDash.setAttribute('aria-selected', activeEditorialSection === 'dashboard' ? 'true' : 'false');
    btnDash.textContent = '📊 Visão Geral';
    btnDash.addEventListener('click', () => switchEditorialSection('dashboard'));
    navBar.appendChild(btnDash);

    EDITORIAL_SECTIONS.forEach(sec => {
      const btn = createEl('button', `editorial-nav-btn ${activeEditorialSection === sec.id ? 'is-active' : ''}`);
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', activeEditorialSection === sec.id ? 'true' : 'false');
      btn.textContent = `${sec.icon} ${sec.name}`;
      btn.addEventListener('click', () => switchEditorialSection(sec.id));
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
   * Alterna a seção do CMS com proteção contra Stale Render.
   */
  function switchEditorialSection(sectionId) {
    if (activeEditorialSection === sectionId) return;
    activeEditorialSection = sectionId;
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
   * Renderiza a listagem de uma das 7 seções editoriais com busca local e filtros.
   */
  async function renderEditorialSection(sectionId, container) {
    const requestId = ++currentCmsRequestId;
    const secConfig = EDITORIAL_SECTIONS.find(s => s.id === sectionId);
    if (!secConfig) return;

    container.innerHTML = '';

    // Barra de Ferramentas / Toolbar (Busca e Filtros Read-Only)
    const toolbar = createEl('div', 'editorial-toolbar');

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

    // Rodapé do Card com Badges Padronizados
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
