/**
 * CHRONUS — Chronicle Module (Crônica dos Despertos)
 * Renderização e controle de listagem de capítulos com suporte a capas assinadas.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getChapters().
 * 2. Resolve assets de capa privados exclusivamente via window.ChronusAssets.getSignedUrl().
 * 3. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 4. Protegido contra race conditions via requestId incremental e validação de rota ativa.
 */
window.ChronusChronicle = (function() {
  'use strict';

  let currentRequestId = 0;

  /**
   * Valida se a requisição assíncrona ainda é a mais recente e se a rota ativa continua sendo a Crônica.
   * @private
   * @param {number} requestId
   * @returns {boolean}
   */
  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/chronicle'
    );
  }

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

      if (!isRequestCurrent(requestId)) return;

      if (!chapters || chapters.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Capítulos com Resolução Segura de Capas
        await renderChapters(container, chapters, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
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

  async function renderChapters(container, chapters, requestId) {
    // 1. Resolver Signed URLs para capítulos com cover_image_path
    const chaptersWithAssets = await Promise.all(chapters.map(async (chapter) => {
      let signedUrl = null;
      if (chapter.cover_image_path && typeof chapter.cover_image_path === 'string' && chapter.cover_image_path.trim()) {
        try {
          signedUrl = await window.ChronusAssets?.getSignedUrl?.('campaign-images', chapter.cover_image_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [ChronicleModule]: Falha ao resolver asset de capa do capítulo');
          signedUrl = null;
        }
      }

      if (!isRequestCurrent(requestId)) {
        return { chapter, signedUrl: null, stale: true };
      }

      return { chapter, signedUrl, stale: false };
    }));

    // Guarda contra race condition pós-assinatura assíncrona
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    chaptersWithAssets.forEach(({ chapter, signedUrl, stale }) => {
      if (stale) return;

      const card = document.createElement('article');
      card.className = 'editorial-card content-card chronicle-card';

      // Se houver signed URL válida, renderizar container e imagem de capa
      if (signedUrl && typeof signedUrl === 'string') {
        const coverWrap = document.createElement('div');
        coverWrap.className = 'chronicle-cover-wrap';

        const img = document.createElement('img');
        img.className = 'chronicle-cover-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = chapter.title ? `Capa de ${chapter.title}` : 'Capa do capítulo';
        img.src = signedUrl;

        coverWrap.appendChild(img);
        card.appendChild(coverWrap);
      }

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
