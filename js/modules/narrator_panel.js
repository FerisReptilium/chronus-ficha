/**
 * CHRONUS — Narrator Panel Module
 * Painel seguro para o Narrador inspecionar as 5 fichas dos jogadores em modo somente leitura.
 */
window.ChronusNarratorPanel = (function() {
  async function load() {
    const panel = document.getElementById('narrator-panel-container');
    if (!panel) return;

    const user = window.ChronusAuth?.getUser();
    const profile = window.ChronusAuth?.getProfile();

    if (!user || profile?.role !== 'narrator') {
      panel.innerHTML = `
        <div class="editorial-box error-state">
          <h3>Acesso Restrito</h3>
          <p>Esta área é exclusiva do Narrador da crônica.</p>
        </div>
      `;
      return;
    }

    panel.innerHTML = `
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

      renderNarratorGrid(players || [], newestByUser);
    } catch (err) {
      console.error('CHRONUS: Erro ao carregar painel do narrador:', err);
      panel.innerHTML = `
        <div class="editorial-box error-state">
          <h3>Não foi possível carregar as fichas</h3>
          <p>${err.message || 'Erro de conexão com o banco de dados.'}</p>
          <button type="button" class="portal-btn" onclick="window.ChronusNarratorPanel.load()">Atualizar Fichas</button>
        </div>
      `;
    }
  }

  function renderNarratorGrid(players, newestByUser) {
    const panel = document.getElementById('narrator-panel-container');
    if (!panel) return;

    if (players.length === 0) {
      panel.innerHTML = `
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

    panel.innerHTML = `
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

    document.getElementById('btn-narrator-refresh')?.addEventListener('click', load);

    // Bind botões "Abrir Ficha"
    panel.querySelectorAll('.btn-open-readonly-sheet').forEach(btn => {
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

  return {
    load
  };
})();
