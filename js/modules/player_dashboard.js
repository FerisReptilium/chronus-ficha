/**
 * CHRONUS — Player Dashboard Module ("Minha Área")
 * Exibe personagem e briefing dinâmico da crônica com dados autorizados por RLS.
 */
window.ChronusPlayerDashboard = (function() {
  'use strict';

  let currentLoadId = 0;
  let currentPortraitUrl = null;

  const EMPTY_BRIEFING = Object.freeze({
    activeSession: null,
    nextSession: null,
    lastSession: null,
    relationSession: null,
    relations: Object.freeze({ npcs: [], locations: [], documents: [] })
  });

  const NPC_STATUS = Object.freeze({
    alive: 'Vivo',
    dead: 'Morto',
    missing: 'Desaparecido',
    unknown: 'Desconhecido',
    transformed: 'Transformado'
  });

  const LOCATION_TYPES = Object.freeze({
    city: 'Cidade',
    district: 'Distrito',
    neighborhood: 'Bairro',
    building: 'Edifício',
    bunker: 'Bunker',
    club: 'Clube',
    facility: 'Instalação',
    supernatural_domain: 'Domínio Sobrenatural',
    battlemap: 'Mapa Tático',
    street: 'Rua',
    bar: 'Bar',
    hotel: 'Hotel',
    hospital: 'Hospital',
    church: 'Igreja',
    cemetery: 'Cemitério',
    park: 'Parque',
    forest: 'Floresta',
    warehouse: 'Armazém',
    station: 'Estação',
    other: 'Outro'
  });

  const DOCUMENT_TYPES = Object.freeze({
    photograph: 'Fotografia',
    letter: 'Carta',
    report: 'Relatório',
    newspaper_clipping: 'Recorte de Jornal',
    official_record: 'Registro Oficial',
    clue: 'Pista',
    artifact: 'Artefato',
    audio_log: 'Registro de Áudio',
    other: 'Documento'
  });

  function setTextContent(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
  }

  function isLoadCurrent(loadId) {
    return loadId === currentLoadId && window.ChronusRouter?.getCurrentRoute?.() === '#/player';
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  async function load() {
    const loadId = ++currentLoadId;
    const user = window.ChronusAuth?.getUser();
    const profile = window.ChronusAuth?.getProfile();
    const container = document.getElementById('player-dashboard-content');
    if (!container) return;

    if (!user) {
      container.innerHTML = `
        <div class="editorial-box empty-state">
          <h3>Sessão não identificada</h3>
          <p>Faça login para acessar o santuário do seu personagem.</p>
          <button type="button" class="portal-btn portal-btn-gold" id="btn-dashboard-login">Entrar</button>
        </div>
      `;
      document.getElementById('btn-dashboard-login')?.addEventListener('click', () => {
        window.ChronusAuth.showAuthModal();
      });
      return;
    }

    container.innerHTML = `
      <div class="dashboard-loading">
        <div class="spinner-occult"></div>
        <p>Acessando registros do Desperto…</p>
      </div>
    `;

    try {
      const client = window.ChronusSupabase.getClient();
      if (!client) throw new Error('Conexão Supabase indisponível.');

      const characterRequest = client
        .from('characters')
        .select('id, name, data, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const briefingRequest = window.ChronusContent?.getPlayerBriefing
        ? window.ChronusContent.getPlayerBriefing()
        : Promise.resolve(EMPTY_BRIEFING);

      const [characterResult, briefingResult] = await Promise.all([
        characterRequest,
        Promise.resolve(briefingRequest).then(
          value => ({ ok: true, value }),
          error => ({ ok: false, error })
        )
      ]);

      if (!isLoadCurrent(loadId)) return;
      if (characterResult.error) throw characterResult.error;

      if (!briefingResult.ok) {
        console.error('CHRONUS: Briefing da crônica temporariamente indisponível:', briefingResult.error);
      }

      renderDashboard(
        user,
        profile,
        characterResult.data,
        briefingResult.ok ? briefingResult.value : EMPTY_BRIEFING,
        !briefingResult.ok
      );
    } catch (err) {
      if (!isLoadCurrent(loadId)) return;
      console.error('CHRONUS: Erro ao carregar dashboard do jogador:', err);
      container.innerHTML = `
        <div class="editorial-box error-state">
          <h3>Falha ao carregar registros</h3>
          <p id="dashboard-load-error"></p>
          <button type="button" class="portal-btn" id="btn-dashboard-retry">Tentar Novamente</button>
        </div>
      `;
      setTextContent('dashboard-load-error', err?.message || 'Verifique sua conexão com a internet.');
      document.getElementById('btn-dashboard-retry')?.addEventListener('click', () => load());
    }
  }

  function renderDashboard(user, profile, character, briefing, briefingUnavailable) {
    const container = document.getElementById('player-dashboard-content');
    if (!container) return;
    document.documentElement.dataset.chronusPlayerDashboard = 'v1.4.3';

    const sheetData = character?.data || {};
    const identity = sheetData.identity || {};
    const charName = identity.name || character?.name || 'Personagem Sem Nome';
    const charTradition = identity.tradition || 'Tradição Desconhecida';
    const charConcept = identity.concept || 'Conceito não definido';
    const charProfession = identity.profession || 'Profissão não informada';
    const playerName = profile?.display_name || identity.player || user.email?.split('@')[0] || 'Jogador';

    const lastSyncStr = character?.updated_at
      ? new Date(character.updated_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
      : 'Ainda não sincronizado na nuvem';

    container.innerHTML = `
      <div class="character-hero-card">
        <div class="character-portrait-frame">
          <img id="dashboard-char-portrait" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzFhMTAwYyIgc3Ryb2tlPSIjOTY2YjE2IiBzdHJva2Utd2lkdGg9IjIiLz48dGV4dCB4PSI1MCUiIHk9IjU1JSIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2NmYWI3NSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+4pyRPC90ZXh0Pjwvc3ZnPg==" alt="Retrato do Personagem">
          <div class="portrait-glow"></div>
        </div>

        <div class="character-details">
          <div class="character-meta-top">
            <span class="badge-occult">DESPERTO</span>
            <span class="sync-status-text" id="dashboard-sync-status"></span>
          </div>

          <h2 class="character-name-heading" id="dashboard-character-name"></h2>
          <p class="character-concept-lead" id="dashboard-character-concept"></p>

          <div class="character-tags-grid">
            <div class="tag-item">
              <span class="tag-label">Jogador</span>
              <span class="tag-val" id="dashboard-player-name"></span>
            </div>
            <div class="tag-item">
              <span class="tag-label">Tradição / Convenção</span>
              <span class="tag-val" id="dashboard-character-tradition"></span>
            </div>
            <div class="tag-item">
              <span class="tag-label">Profissão</span>
              <span class="tag-val" id="dashboard-character-profession"></span>
            </div>
            <div class="tag-item">
              <span class="tag-label">Crônica</span>
              <span class="tag-val" id="dashboard-character-chronicle"></span>
            </div>
          </div>

          <div class="character-cta-row">
            <a href="#/sheet" class="portal-btn portal-btn-primary portal-btn-lg">
              <span class="btn-icon">📜</span> ABRIR MINHA FICHA
            </a>
            <button type="button" class="portal-btn portal-btn-secondary" id="btn-dashboard-change-pwd">
              Alterar Senha
            </button>
          </div>
        </div>
      </div>

      <section class="dashboard-briefing" aria-labelledby="dashboard-briefing-title">
        <header class="dashboard-briefing-head">
          <div>
            <span class="dashboard-briefing-kicker">Sonderstelle K-17 · Briefing autorizado</span>
            <h2 id="dashboard-briefing-title">Estado atual da investigação</h2>
          </div>
          <span class="dashboard-briefing-security">NÍVEL · JOGADORES</span>
        </header>

        <div class="dashboard-briefing-grid">
          <article class="briefing-card briefing-objective-card">
            <div class="briefing-card-topline">
              <span class="briefing-card-code">DIRETRIZ ATUAL</span>
              <span class="briefing-status" id="dashboard-active-status"></span>
            </div>
            <h3 id="dashboard-active-title"></h3>
            <p class="briefing-objective-text" id="dashboard-current-objective"></p>
            <a href="#/sessions" class="card-link">Abrir diário completo →</a>
          </article>

          <article class="briefing-card">
            <span class="briefing-card-code">PRÓXIMA SESSÃO</span>
            <h3 id="dashboard-next-title"></h3>
            <p class="briefing-card-primary" id="dashboard-next-date"></p>
            <p class="briefing-card-secondary" id="dashboard-next-ingame"></p>
          </article>

          <article class="briefing-card briefing-summary-card">
            <span class="briefing-card-code">ÚLTIMO RELATÓRIO</span>
            <h3 id="dashboard-last-title"></h3>
            <p class="briefing-summary-text" id="dashboard-last-summary"></p>
            <a href="#/sessions" class="card-link">Rever acontecimentos →</a>
          </article>
        </div>

        <section class="dashboard-related" aria-labelledby="dashboard-related-title">
          <header class="dashboard-related-head">
            <div>
              <span class="briefing-card-code">CONEXÕES DA MISSÃO</span>
              <h3 id="dashboard-related-title">Relacionado nesta investigação</h3>
            </div>
            <span class="dashboard-related-session" id="dashboard-related-session"></span>
          </header>
          <div class="dashboard-related-grid" id="dashboard-related-content"></div>
        </section>

        <nav class="dashboard-quick-links" aria-label="Acesso rápido aos arquivos da crônica">
          <a href="#/sessions"><span>▣</span> Sessões</a>
          <a href="#/npcs"><span>◉</span> NPCs</a>
          <a href="#/maps"><span>⌖</span> Atlas</a>
          <a href="#/files"><span>◇</span> Evidências</a>
        </nav>
      </section>
    `;

    setTextContent('dashboard-sync-status', `✦ Sincronização: ${lastSyncStr}`);
    setTextContent('dashboard-character-name', charName);
    setTextContent('dashboard-character-concept', `“${charConcept}”`);
    setTextContent('dashboard-player-name', playerName);
    setTextContent('dashboard-character-tradition', charTradition);
    setTextContent('dashboard-character-profession', charProfession);
    setTextContent('dashboard-character-chronicle', identity.chronicle || 'Ecologia Sobrenatural');

    renderBriefing(briefing || EMPTY_BRIEFING, briefingUnavailable);

    document.getElementById('btn-dashboard-change-pwd')?.addEventListener('click', () => {
      window.ChronusAuth.showPasswordModal('change');
    });

    loadPortraitForDashboard(user.id);
  }

  function renderBriefing(briefing, briefingUnavailable) {
    if (briefingUnavailable) {
      setTextContent('dashboard-active-status', 'Temporariamente indisponível');
      setTextContent('dashboard-active-title', 'Briefing não recuperado');
      setTextContent('dashboard-current-objective', 'Sua ficha continua disponível. Tente novamente em instantes para atualizar os registros da crônica.');
      setTextContent('dashboard-next-title', 'Agenda indisponível');
      setTextContent('dashboard-next-date', 'Não foi possível consultar a próxima sessão.');
      setTextContent('dashboard-next-ingame', '');
      setTextContent('dashboard-last-title', 'Relatório indisponível');
      setTextContent('dashboard-last-summary', 'Não foi possível consultar o último resumo.');
      renderRelations(EMPTY_BRIEFING.relations, null);
      return;
    }

    const active = briefing.activeSession;
    const next = briefing.nextSession;
    const last = briefing.lastSession;

    if (active) {
      const activeLabel = active.status === 'in_progress' ? 'Sessão em andamento' : 'Missão planejada';
      setTextContent('dashboard-active-status', `${activeLabel} · #${active.session_number}`);
      setTextContent('dashboard-active-title', active.title || 'Operação sem título');
      setTextContent(
        'dashboard-current-objective',
        active.current_objective || 'O Narrador ainda não liberou uma diretriz para esta sessão.'
      );
    } else {
      setTextContent('dashboard-active-status', 'Aguardando nova missão');
      setTextContent('dashboard-active-title', 'Nenhuma operação ativa');
      setTextContent('dashboard-current-objective', 'Novos objetivos aparecerão aqui quando forem liberados pelo Narrador.');
    }

    if (next) {
      setTextContent('dashboard-next-title', `Sessão #${next.session_number} · ${next.title || 'Sem título'}`);
      setTextContent('dashboard-next-date', formatSessionDate(next.session_date) || 'Data real ainda não definida');
      setTextContent('dashboard-next-ingame', next.in_game_date ? `Na crônica: ${next.in_game_date}` : 'Data narrativa ainda não informada');
    } else if (active?.status === 'in_progress') {
      setTextContent('dashboard-next-title', `Sessão #${active.session_number} em andamento`);
      setTextContent('dashboard-next-date', formatSessionDate(active.session_date) || 'Operação ativa agora');
      setTextContent('dashboard-next-ingame', active.in_game_date ? `Na crônica: ${active.in_game_date}` : '');
    } else {
      setTextContent('dashboard-next-title', 'Nenhuma sessão agendada');
      setTextContent('dashboard-next-date', 'A próxima convocação aparecerá aqui.');
      setTextContent('dashboard-next-ingame', '');
    }

    if (last) {
      setTextContent('dashboard-last-title', `Sessão #${last.session_number} · ${last.title || 'Sem título'}`);
      setTextContent('dashboard-last-summary', last.summary || 'Esta sessão ainda não possui um resumo liberado.');
    } else {
      setTextContent('dashboard-last-title', 'Nenhum relatório anterior');
      setTextContent('dashboard-last-summary', 'O primeiro resumo aparecerá aqui após uma sessão concluída e publicada.');
    }

    renderRelations(briefing.relations || EMPTY_BRIEFING.relations, briefing.relationSession);
  }

  function formatSessionDate(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;

    const formatted = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  function renderRelations(relations, relationSession) {
    const container = document.getElementById('dashboard-related-content');
    if (!container) return;
    container.replaceChildren();

    setTextContent(
      'dashboard-related-session',
      relationSession ? `Sessão #${relationSession.session_number}` : 'Sem sessão de referência'
    );

    const groups = [
      {
        key: 'npcs',
        icon: '◉',
        title: 'NPCs envolvidos',
        empty: 'Nenhum NPC relacionado.',
        href: '#/npcs',
        getName: item => item.name || 'NPC sem identificação',
        getMeta: item => item.relation_note || item.role_occupation || NPC_STATUS[item.status] || null
      },
      {
        key: 'locations',
        icon: '⌖',
        title: 'Locais de interesse',
        empty: 'Nenhum local relacionado.',
        href: '#/maps',
        getName: item => item.name || 'Local não identificado',
        getMeta: item => item.relation_note || item.district_region || LOCATION_TYPES[item.type] || null
      },
      {
        key: 'documents',
        icon: '◇',
        title: 'Evidências ligadas',
        empty: 'Nenhuma evidência relacionada.',
        href: '#/files',
        getName: item => item.title || 'Documento sem título',
        getMeta: item => item.relation_note || DOCUMENT_TYPES[item.type] || null
      }
    ];

    groups.forEach(group => {
      const section = createElement('section', 'dashboard-related-group');
      section.dataset.relationshipKind = group.key;
      const title = createElement('h4');
      title.append(createElement('span', 'dashboard-related-icon', group.icon), document.createTextNode(` ${group.title}`));
      section.appendChild(title);

      const items = Array.isArray(relations[group.key]) ? relations[group.key] : [];
      if (items.length === 0) {
        section.appendChild(createElement('p', 'dashboard-related-empty', group.empty));
      } else {
        const list = createElement('ul', 'dashboard-related-list');
        items.forEach(item => {
          const row = createElement('li');
          const link = createElement('a');
          link.href = group.href;
          link.appendChild(createElement('strong', null, group.getName(item)));
          const meta = group.getMeta(item);
          if (meta) link.appendChild(createElement('span', null, meta));
          row.appendChild(link);
          list.appendChild(row);
        });
        section.appendChild(list);
      }

      container.appendChild(section);
    });
  }

  async function loadPortraitForDashboard(userId) {
    const client = window.ChronusSupabase.getClient();
    const img = document.getElementById('dashboard-char-portrait');
    if (!client || !img) return;

    try {
      const { data, error } = await client.storage.from('portraits').download(`${userId}/portrait`);
      if (!error && data && document.getElementById('dashboard-char-portrait') === img) {
        if (currentPortraitUrl) URL.revokeObjectURL(currentPortraitUrl);
        currentPortraitUrl = URL.createObjectURL(data);
        img.src = currentPortraitUrl;
      }
    } catch (error) {
      console.warn('Retrato não encontrado na nuvem para dashboard:', error);
    }
  }

  return {
    load
  };
})();
