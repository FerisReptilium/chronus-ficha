/**
 * CHRONUS — Chronicle Module (Crônica dos Despertos)
 * Renderização e controle de listagem de capítulos.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getChapters().
 * 2. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 3. Protegido contra race conditions via requestId incremental.
 */
window.ChronusChronicle = (function() {
  'use strict';

  let currentRequestId = 0;

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/chronicle') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('chronicle-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const chapters = await window.ChronusContent.getChapters();

      if (requestId !== currentRequestId) return;

      if (!chapters || chapters.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Capítulos
        renderChapters(container, chapters);
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
      console.error('CHRONUS [ChronicleModule]: Falha ao carregar capítulos:', err);
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
    text.textContent = 'Carregando crônica...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhum capítulo publicado';

    const desc = document.createElement('p');
    desc.textContent = 'Os registros da crônica aparecerão aqui quando estiverem disponíveis.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar a crônica';

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

  function renderChapters(container, chapters) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    chapters.forEach(chapter => {
      const card = document.createElement('article');
      card.className = 'editorial-card content-card';

      const headerDiv = document.createElement('div');

      // Kicker / Número do Capítulo
      const kicker = document.createElement('span');
      kicker.className = 'section-kicker';
      if (chapter.chapter_number == null) {
        kicker.textContent = 'Prólogo / Especial';
      } else {
        kicker.textContent = `Capítulo ${chapter.chapter_number}`;
      }
      headerDiv.appendChild(kicker);

      // Título
      const title = document.createElement('h3');
      title.className = 'card-title-editorial';
      title.textContent = chapter.title || 'Capítulo sem título';
      headerDiv.appendChild(title);

      // Subtítulo
      if (chapter.subtitle) {
        const subtitle = document.createElement('h4');
        subtitle.className = 'card-subtitle-editorial';
        subtitle.textContent = chapter.subtitle;
        headerDiv.appendChild(subtitle);
      }

      // Sumário / Resumo
      if (chapter.summary) {
        const summary = document.createElement('p');
        summary.className = 'card-text-body';
        summary.textContent = chapter.summary;
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
