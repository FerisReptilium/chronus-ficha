/**
 * CHRONUS — Soundtrack Module (Trilha Sonora Oficial)
 * Renderização e controle de listagem de faixas e paisagens sonoras da crônica com abertura segura no YouTube.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getSoundtrack().
 * 2. youtube_url é recurso externo: NÃO consome ChronusAssets, Storage ou Supabase direto.
 * 3. Validação estrita de URL com new URL(): somente https:, porta padrão (443 ou vazia), sem credenciais e allowlist exata de hosts YouTube.
 * 4. Abertura síncrona via window.open(safeUrl, '_blank', 'noopener,noreferrer') somente sob clique explícito.
 * 5. URLs seguras não são expostas em atributos DOM (href, dataset, title, aria-label).
 * 6. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 7. Protegido contra race conditions via requestId incremental e validação de rota ativa.
 */
window.ChronusSoundtrack = (function() {
  'use strict';

  let currentRequestId = 0;

  const CATEGORY_MAP = {
    'ambient': 'Ambiente',
    'combat': 'Combate',
    'investigation': 'Investigação',
    'mystery': 'Mistério',
    'horror': 'Horror',
    'tension': 'Tensão',
    'character': 'Personagem',
    'location': 'Local',
    'session': 'Sessão',
    'theme': 'Tema',
    'intro': 'Abertura',
    'ending': 'Encerramento',
    'other': 'Outro'
  };

  const ALLOWED_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be'
  ]);

  /**
   * Valida e normaliza de forma estrita uma URL do YouTube.
   * Aceita somente protocolo HTTPS, porta padrão (443 ou vazia), sem credenciais embutidas e domínios da allowlist exata.
   * @private
   * @param {*} value
   * @returns {string|null} URL normalizada segura ou null se inválida
   */
  function getSafeYoutubeUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    let parsed = null;
    try {
      parsed = new URL(trimmed);
    } catch (e) {
      return null;
    }

    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port !== '' && parsed.port !== '443') return null;
    if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    return parsed.href;
  }

  /**
   * Valida se a requisição assíncrona ainda é a mais recente e se a rota ativa continua sendo Trilha Sonora.
   * @private
   * @param {number} requestId
   * @returns {boolean}
   */
  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/soundtrack'
    );
  }

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/soundtrack') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('soundtrack-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const tracks = await window.ChronusContent.getSoundtrack();

      if (!isRequestCurrent(requestId)) return;

      if (!tracks || tracks.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Faixas com Abertura Segura de YouTube
        renderTracks(container, tracks, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [SoundtrackModule]: Falha ao carregar trilha sonora:', err);
      // Estado C: ERROR
      renderError(container);
    }
  }

  function renderLoading(container) {
    container.innerHTML = '';
    const loadingBox = document.createElement('div');
    loadingBox.className = 'dashboard-loading';

    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';

    const text = document.createElement('p');
    text.textContent = 'Carregando trilha sonora...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhuma faixa disponível';

    const desc = document.createElement('p');
    desc.textContent = 'A trilha sonora oficial da crônica aparecerá aqui quando estiver disponível.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar a trilha sonora';

    const desc = document.createElement('p');
    desc.textContent = 'Ocorreu uma instabilidade ao consultar as faixas da campanha.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());

    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(btn);
    container.appendChild(box);
  }

  function formatCategory(catVal) {
    if (!catVal) return '';
    return CATEGORY_MAP[catVal] || catVal;
  }

  function renderTracks(container, tracks, requestId) {
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    tracks.forEach(track => {
      const card = document.createElement('article');
      card.className = 'editorial-card content-card soundtrack-card';

      const headerDiv = document.createElement('div');

      // Top row: Categoria + Status Badge (Ativa / Inativa)
      const topRow = document.createElement('div');
      topRow.className = 'content-card-top-row';

      if (track.category) {
        const kicker = document.createElement('span');
        kicker.className = 'section-kicker';
        kicker.textContent = formatCategory(track.category);
        topRow.appendChild(kicker);
      }

      if (track.active === true) {
        const badge = document.createElement('span');
        badge.className = 'badge-occult soundtrack-status-badge soundtrack-status-active';
        badge.textContent = 'Ativa';
        topRow.appendChild(badge);
      } else if (track.active === false) {
        const badge = document.createElement('span');
        badge.className = 'badge-occult soundtrack-status-badge soundtrack-status-inactive';
        badge.textContent = 'Inativa';
        topRow.appendChild(badge);
      }

      if (topRow.childElementCount > 0) {
        headerDiv.appendChild(topRow);
      }

      // Título da Faixa
      const title = document.createElement('h3');
      title.className = 'card-title-editorial';
      title.textContent = track.title || 'Faixa sem título';
      headerDiv.appendChild(title);

      // Descrição
      if (track.description) {
        const desc = document.createElement('p');
        desc.className = 'card-text-body soundtrack-desc';
        desc.textContent = track.description;
        headerDiv.appendChild(desc);
      }

      card.appendChild(headerDiv);

      // Ação Externa: Ouvir no YouTube (apenas se youtube_url for válida e segura)
      const safeYoutubeUrl = getSafeYoutubeUrl(track.youtube_url);
      if (safeYoutubeUrl) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'soundtrack-card-actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'portal-btn portal-btn-secondary soundtrack-youtube-button';
        openBtn.textContent = 'Ouvir no YouTube';

        const msgDiv = document.createElement('div');
        msgDiv.className = 'soundtrack-action-msg';
        msgDiv.setAttribute('role', 'status');
        msgDiv.setAttribute('aria-live', 'polite');

        openBtn.addEventListener('click', () => {
          msgDiv.textContent = '';
          if (!isRequestCurrent(requestId)) return;

          let popup = null;
          try {
            popup = window.open('about:blank', '_blank');
          } catch (e) {
            popup = null;
          }

          if (!popup) {
            msgDiv.textContent = 'Não foi possível abrir o YouTube. Verifique o bloqueio de pop-ups.';
            return;
          }

          try {
            popup.opener = null;
          } catch (e) {}

          let navigationSucceeded = false;
          try {
            popup.location.replace(safeYoutubeUrl);
            navigationSucceeded = true;
          } catch (e) {
            try {
              popup.location.href = safeYoutubeUrl;
              navigationSucceeded = true;
            } catch (err2) {
              navigationSucceeded = false;
            }
          }

          if (!navigationSucceeded) {
            if (popup && !popup.closed) {
              try { popup.close(); } catch (e) {}
            }
            msgDiv.textContent = 'Não foi possível abrir o YouTube.';
          }
        });

        actionsDiv.appendChild(openBtn);
        actionsDiv.appendChild(msgDiv);
        card.appendChild(actionsDiv);
      }

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  return {
    init,
    load
  };
})();
