/**
 * CHRONUS — Sessions Module (Diário de Sessões)
 * Renderização e controle de listagem do diário de bordo da campanha com suporte a capas assinadas.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getSessions().
 * 2. Resolve assets de capa privados exclusivamente via window.ChronusAssets.getSignedUrl().
 * 3. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 4. Formatação segura de datas (sem quebrar por valores inválidos).
 * 5. Protegido contra race conditions via requestId incremental e validação de rota ativa.
 */
window.ChronusSessions = (function() {
  'use strict';

  let currentRequestId = 0;

  const STATUS_MAP = {
    'completed': { label: 'Concluída', class: 'status-completed' },
    'in_progress': { label: 'Em Andamento', class: 'status-in-progress' },
    'planned': { label: 'Planejada', class: 'status-planned' },
    'canceled': { label: 'Cancelada', class: 'status-canceled' }
  };

  /**
   * Valida se a requisição assíncrona ainda é a mais recente e se a rota ativa continua sendo Sessões.
   * @private
   * @param {number} requestId
   * @returns {boolean}
   */
  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/sessions'
    );
  }

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/sessions') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('sessions-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const sessions = await window.ChronusContent.getSessions();

      if (!isRequestCurrent(requestId)) return;

      if (!sessions || sessions.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Sessões com Resolução Segura de Capas
        await renderSessions(container, sessions, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [SessionsModule]: Falha ao carregar sessões:', err);
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
    text.textContent = 'Carregando sessões...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhuma sessão disponível';

    const desc = document.createElement('p');
    desc.textContent = 'Os registros das sessões aparecerão aqui quando estiverem disponíveis.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar as sessões';

    const desc = document.createElement('p');
    desc.textContent = 'Ocorreu uma instabilidade na conexão. Tente novamente em instantes.';

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

  function formatSessionDate(dateVal) {
    if (!dateVal || typeof dateVal !== 'string') return null;
    const match = dateVal.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);

    const d = new Date(year, month, day);
    if (
      d.getFullYear() === year &&
      d.getMonth() === month &&
      d.getDate() === day
    ) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    return null;
  }

  async function renderSessions(container, sessions, requestId) {
    // 1. Resolver Signed URLs para sessões com cover_image_path
    const sessionsWithAssets = await Promise.all(sessions.map(async (session) => {
      let signedUrl = null;
      if (session.cover_image_path && typeof session.cover_image_path === 'string' && session.cover_image_path.trim()) {
        try {
          signedUrl = await window.ChronusAssets?.getSignedUrl?.('campaign-images', session.cover_image_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [SessionsModule]: Falha ao resolver asset de capa da sessão');
          signedUrl = null;
        }
      }

      if (!isRequestCurrent(requestId)) {
        return { session, signedUrl: null, stale: true };
      }

      return { session, signedUrl, stale: false };
    }));

    // Guarda contra race condition pós-assinatura assíncrona
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    sessionsWithAssets.forEach(({ session, signedUrl, stale }) => {
      if (stale) return;

      const card = document.createElement('article');
      card.className = 'editorial-card content-card session-card';

      // Se houver signed URL válida, renderizar container e imagem de capa
      if (signedUrl && typeof signedUrl === 'string') {
        const coverWrap = document.createElement('div');
        coverWrap.className = 'session-cover-wrap';

        const img = document.createElement('img');
        img.className = 'session-cover-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = session.title ? `Capa de ${session.title}` : 'Capa da sessão';
        img.src = signedUrl;

        coverWrap.appendChild(img);
        card.appendChild(coverWrap);
      }

      const headerDiv = document.createElement('div');

      // Top row: Número da Sessão + Status Badge
      const topRow = document.createElement('div');
      topRow.className = 'content-card-top-row';

      const kicker = document.createElement('span');
      kicker.className = 'section-kicker';
      kicker.textContent = `Sessão ${session.session_number}`;
      topRow.appendChild(kicker);

      const statusInfo = STATUS_MAP[session.status] || { label: session.status || 'Registrada', class: '' };
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge-occult session-status-badge ${statusInfo.class}`;
      statusBadge.textContent = statusInfo.label;
      topRow.appendChild(statusBadge);

      headerDiv.appendChild(topRow);

      // Título
      const title = document.createElement('h3');
      title.className = 'card-title-editorial';
      title.textContent = session.title || 'Sessão sem título';
      headerDiv.appendChild(title);

      // Datas (Mundo Real e In-Game)
      const formattedRealDate = formatSessionDate(session.session_date);
      if (formattedRealDate || session.in_game_date) {
        const dateMeta = document.createElement('div');
        dateMeta.className = 'session-meta-dates';

        if (formattedRealDate) {
          const realSpan = document.createElement('span');
          realSpan.className = 'meta-date-item';
          realSpan.textContent = `📅 ${formattedRealDate}`;
          dateMeta.appendChild(realSpan);
        }

        if (session.in_game_date) {
          const gameSpan = document.createElement('span');
          gameSpan.className = 'meta-date-item meta-date-ingame';
          gameSpan.textContent = `⏳ Na narrativa: ${session.in_game_date}`;
          dateMeta.appendChild(gameSpan);
        }

        headerDiv.appendChild(dateMeta);
      }

      // Sumário / Resumo
      if (session.summary) {
        const summary = document.createElement('p');
        summary.className = 'card-text-body';
        summary.textContent = session.summary;
        headerDiv.appendChild(summary);
      }

      card.appendChild(headerDiv);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  return {
    init,
    load
  };
})();
