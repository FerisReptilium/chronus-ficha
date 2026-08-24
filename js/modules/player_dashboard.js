/**
 * CHRONUS — Player Dashboard Module ("Minha Área")
 * Exibe resumo do personagem, retrato, status de sincronização e atalhos rápidos.
 */
window.ChronusPlayerDashboard = (function() {
  async function load() {
    const user = window.ChronusAuth?.getUser();
    const profile = window.ChronusAuth?.getProfile();
    const container = document.getElementById('player-dashboard-content');
    if (!container) return;

    if (!user) {
      container.innerHTML = `
        <div class="editorial-box empty-state">
          <h3>Sessão não identificada</h3>
          <p>Faça login para acessar o santuário do seu personagem.</p>
          <button type="button" class="portal-btn portal-btn-gold" onclick="window.ChronusAuth.showAuthModal()">Entrar</button>
        </div>
      `;
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
      const { data: character, error } = await client
        .from('characters')
        .select('id, name, data, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      renderDashboard(user, profile, character);
    } catch (err) {
      console.error('CHRONUS: Erro ao carregar dashboard do jogador:', err);
      container.innerHTML = `
        <div class="editorial-box error-state">
          <h3>Falha ao carregar registros</h3>
          <p>${err.message || 'Verifique sua conexão com a internet.'}</p>
          <button type="button" class="portal-btn" onclick="window.ChronusPlayerDashboard.load()">Tentar Novamente</button>
        </div>
      `;
    }
  }

  function renderDashboard(user, profile, character) {
    const container = document.getElementById('player-dashboard-content');
    if (!container) return;

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
      <!-- Card Principal do Desperto -->
      <div class="character-hero-card">
        <div class="character-portrait-frame">
          <img id="dashboard-char-portrait" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzFhMTAwYyIgc3Ryb2tlPSIjOTY2YjE2IiBzdHJva2Utd2lkdGg9IjIiLz48dGV4dCB4PSI1MCUiIHk9IjU1JSIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2NmYWI3NSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+4pyRPC90ZXh0Pjwvc3ZnPg==" alt="Retrato do Personagem">
          <div class="portrait-glow"></div>
        </div>

        <div class="character-details">
          <div class="character-meta-top">
            <span class="badge-occult">DESPERTO</span>
            <span class="sync-status-text">✦ Sincronização: ${lastSyncStr}</span>
          </div>

          <h2 class="character-name-heading">${charName}</h2>
          <p class="character-concept-lead">"${charConcept}"</p>

          <div class="character-tags-grid">
            <div class="tag-item">
              <span class="tag-label">Jogador</span>
              <span class="tag-val">${playerName}</span>
            </div>
            <div class="tag-item">
              <span class="tag-label">Tradição / Convenção</span>
              <span class="tag-val">${charTradition}</span>
            </div>
            <div class="tag-item">
              <span class="tag-label">Profissão</span>
              <span class="tag-val">${charProfession}</span>
            </div>
            <div class="tag-item">
              <span class="tag-label">Crônica</span>
              <span class="tag-val">${identity.chronicle || 'Ecologia Sobrenatural'}</span>
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

      <!-- Grid de Acompanhamento da Crônica -->
      <div class="dashboard-tracking-grid">
        <div class="tracking-card">
          <div class="card-icon">📖</div>
          <div class="card-info">
            <h4>Última Sessão</h4>
            <p>Acompanhe os acontecimentos mais recentes e pistas da cabala.</p>
            <a href="#/sessions" class="card-link">Ver Diário de Sessões →</a>
          </div>
        </div>

        <div class="tracking-card">
          <div class="card-icon">👥</div>
          <div class="card-info">
            <h4>Dossiê de NPCs</h4>
            <p>Consulte os contatos, aliados e figuras enigmáticas descobertas.</p>
            <a href="#/npcs" class="card-link">Explorar NPCs →</a>
          </div>
        </div>

        <div class="tracking-card">
          <div class="card-icon">🗺️</div>
          <div class="card-info">
            <h4>Atlas & Locais</h4>
            <p>Mapas de distritos, santuários e domínios sobrenaturais.</p>
            <a href="#/maps" class="card-link">Abrir Atlas →</a>
          </div>
        </div>

        <div class="tracking-card">
          <div class="card-icon">📁</div>
          <div class="card-info">
            <h4>Arquivos & Evidências</h4>
            <p>Relatórios investigativos, fotografias antigas e recortes.</p>
            <a href="#/files" class="card-link">Examinar Arquivos →</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-dashboard-change-pwd')?.addEventListener('click', () => {
      window.ChronusAuth.showPasswordModal('change');
    });

    // Carregar retrato assincronamente
    loadPortraitForDashboard(user.id);
  }

  async function loadPortraitForDashboard(userId) {
    const client = window.ChronusSupabase.getClient();
    const img = document.getElementById('dashboard-char-portrait');
    if (!client || !img) return;

    try {
      const { data, error } = await client.storage.from('portraits').download(`${userId}/portrait`);
      if (!error && data) {
        const url = URL.createObjectURL(data);
        img.src = url;
      }
    } catch (e) {
      console.warn('Retrato não encontrado na nuvem para dashboard:', e);
    }
  }

  return {
    load
  };
})();
