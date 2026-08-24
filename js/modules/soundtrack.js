/**
 * CHRONUS — Soundtrack Module (Trilha Sonora Oficial)
 * Renderização e controle de listagem de faixas e paisagens sonoras da crônica.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getSoundtrack().
 * 2. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 3. Protegido contra race conditions via requestId incremental.
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

      if (requestId !== currentRequestId) return;

      if (!tracks || tracks.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Faixas
        renderTracks(container, tracks);
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
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

  function renderTracks(container, tracks) {
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
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  return {
    init,
    load
  };
})();
