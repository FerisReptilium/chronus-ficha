/**
 * CHRONUS — Library Module (Biblioteca Oficial)
 * Renderização e controle de listagem de manuais e materiais oficiais da crônica.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getLibraryItems().
 * 2. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 3. Protegido contra race conditions via requestId incremental.
 */
window.ChronusLibrary = (function() {
  'use strict';

  let currentRequestId = 0;

  const CATEGORY_MAP = {
    'core': 'Livro Básico',
    'supplement': 'Suplemento',
    'adventure': 'Aventura',
    'chronicle': 'Crônica',
    'rules': 'Regras',
    'setting': 'Cenário',
    'bestiary': 'Bestiário',
    'character': 'Personagens',
    'reference': 'Referência',
    'handout': 'Material de Jogo',
    'guide': 'Guia',
    'other': 'Outro'
  };

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/library') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('library-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const items = await window.ChronusContent.getLibraryItems();

      if (requestId !== currentRequestId) return;

      if (!items || items.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Itens da Biblioteca
        renderLibrary(container, items);
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
      console.error('CHRONUS [LibraryModule]: Falha ao carregar biblioteca:', err);
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
    text.textContent = 'Carregando biblioteca...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhum item disponível';

    const desc = document.createElement('p');
    desc.textContent = 'Manuais, suplementos e materiais oficiais aparecerão aqui quando estiverem disponíveis.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar a biblioteca';

    const desc = document.createElement('p');
    desc.textContent = 'Ocorreu uma instabilidade ao consultar os materiais da biblioteca.';

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

  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${parseFloat(kb.toFixed(1))} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${parseFloat(mb.toFixed(1))} MB`;
    const gb = mb / 1024;
    return `${parseFloat(gb.toFixed(1))} GB`;
  }

  function renderLibrary(container, items) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'editorial-card content-card library-card';

      const headerDiv = document.createElement('div');

      // Top row: Categoria
      const topRow = document.createElement('div');
      topRow.className = 'content-card-top-row';

      if (item.category) {
        const kicker = document.createElement('span');
        kicker.className = 'section-kicker';
        kicker.textContent = formatCategory(item.category);
        topRow.appendChild(kicker);
      }

      if (topRow.childElementCount > 0) {
        headerDiv.appendChild(topRow);
      }

      // Título do Item
      const title = document.createElement('h3');
      title.className = 'card-title-editorial';
      title.textContent = item.title || 'Item sem título';
      headerDiv.appendChild(title);

      // Versão
      if (item.version) {
        const versionDiv = document.createElement('div');
        versionDiv.className = 'library-version';
        const strong = document.createElement('strong');
        strong.textContent = 'Versão: ';
        const val = document.createTextNode(item.version);
        versionDiv.appendChild(strong);
        versionDiv.appendChild(val);
        headerDiv.appendChild(versionDiv);
      }

      // Descrição
      if (item.description) {
        const desc = document.createElement('p');
        desc.className = 'card-text-body library-desc';
        desc.textContent = item.description;
        headerDiv.appendChild(desc);
      }

      // Meta Footer (Páginas / Tamanho do Arquivo)
      const validPageCount = Number.isInteger(item.page_count) && item.page_count > 0;
      const formattedSize = formatFileSize(item.file_size_bytes);

      if (validPageCount || formattedSize) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'library-meta';

        if (validPageCount) {
          const pageSpan = document.createElement('span');
          pageSpan.className = 'badge-occult library-meta-item';
          pageSpan.textContent = item.page_count === 1 ? '1 página' : `${item.page_count} páginas`;
          metaDiv.appendChild(pageSpan);
        }

        if (formattedSize) {
          const sizeSpan = document.createElement('span');
          sizeSpan.className = 'badge-occult library-meta-item';
          sizeSpan.textContent = formattedSize;
          metaDiv.appendChild(sizeSpan);
        }

        headerDiv.appendChild(metaDiv);
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
