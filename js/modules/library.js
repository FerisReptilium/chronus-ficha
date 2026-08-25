/**
 * CHRONUS — Library Module (Biblioteca Oficial)
 * Renderização e controle de listagem de manuais e materiais oficiais da crônica com suporte a capas assinadas e abertura controlada de arquivos.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getLibraryItems().
 * 2. Resolve capa (cover_path) via window.ChronusAssets.getSignedUrl('library', ..., { expiresIn: 3600 }).
 * 3. Resolve arquivo (file_path) via window.ChronusAssets.getSignedUrl('library', ..., { expiresIn: 300 }) SOMENTE sob clique explícito.
 * 4. file_path nunca é assinado na renderização inicial nem exposto no DOM/HTML.
 * 5. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 6. Protegido contra race conditions via requestId incremental e validação de rota ativa.
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

  /**
   * Valida se a requisição assíncrona ainda é a mais recente e se a rota ativa continua sendo Biblioteca Oficial.
   * @private
   * @param {number} requestId
   * @returns {boolean}
   */
  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/library'
    );
  }

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

      if (!isRequestCurrent(requestId)) return;

      if (!items || items.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Itens da Biblioteca com Resolução Segura de Capas
        await renderLibrary(container, items, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
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

  async function renderLibrary(container, items, requestId) {
    // 1. Resolver Signed URLs EXCLUSIVAMENTE para capas (cover_path)
    const itemsWithAssets = await Promise.all(items.map(async (item) => {
      let signedCoverUrl = null;
      if (item.cover_path && typeof item.cover_path === 'string' && item.cover_path.trim()) {
        try {
          signedCoverUrl = await window.ChronusAssets?.getSignedUrl?.('library', item.cover_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [LibraryModule]: Falha ao resolver capa do item da biblioteca');
          signedCoverUrl = null;
        }
      }

      if (!isRequestCurrent(requestId)) {
        return { item, signedCoverUrl: null, stale: true };
      }

      return { item, signedCoverUrl, stale: false };
    }));

    // Guarda contra race condition pós-assinatura assíncrona de capas
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    itemsWithAssets.forEach(({ item, signedCoverUrl, stale }) => {
      if (stale) return;

      const card = document.createElement('article');
      card.className = 'editorial-card content-card library-card';

      // 1. Capa Visual do Item (se houver signedCoverUrl válida)
      if (signedCoverUrl && typeof signedCoverUrl === 'string') {
        const coverWrap = document.createElement('div');
        coverWrap.className = 'library-cover-wrap';

        const img = document.createElement('img');
        img.className = 'library-cover-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = item.title ? `Capa de ${item.title}` : 'Capa do item da biblioteca';
        img.src = signedCoverUrl;

        coverWrap.appendChild(img);
        card.appendChild(coverWrap);
      }

      // 2. Cabeçalho Textual e Metadados
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

      // 3. Ação de Abertura de Arquivo (se file_path existir)
      if (item.file_path && typeof item.file_path === 'string' && item.file_path.trim()) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'library-card-actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'portal-btn portal-btn-secondary library-open-button';
        openBtn.textContent = 'Abrir arquivo';

        const msgDiv = document.createElement('div');
        msgDiv.className = 'library-action-msg';
        msgDiv.setAttribute('role', 'status');
        msgDiv.setAttribute('aria-live', 'polite');

        openBtn.addEventListener('click', async () => {
          msgDiv.textContent = '';
          if (!isRequestCurrent(requestId)) return;

          // Abrir popup síncrono no evento de clique para contornar bloqueadores
          let popup = null;
          try {
            popup = window.open('about:blank', '_blank');
            if (popup) {
              popup.opener = null;
            }
          } catch (e) {
            popup = null;
          }

          if (!popup) {
            msgDiv.textContent = 'Não foi possível abrir uma nova aba. Verifique o bloqueio de pop-ups.';
            return;
          }

          openBtn.disabled = true;
          const originalText = openBtn.textContent;
          openBtn.textContent = 'Abrindo...';

          let signedFileUrl = null;
          try {
            signedFileUrl = await window.ChronusAssets?.getSignedUrl?.('library', item.file_path, { expiresIn: 300 });
          } catch (err) {
            console.error('CHRONUS [LibraryModule]: Falha ao assinar arquivo da biblioteca');
            signedFileUrl = null;
          }

          // 1. Guarda de requisição stale / troca de rota
          if (!isRequestCurrent(requestId)) {
            if (popup && !popup.closed) {
              try { popup.close(); } catch (e) {}
            }
            return;
          }

          // 2. Popup fechado manualmente antes da resolução (em rota ativa)
          if (!popup || popup.closed) {
            openBtn.disabled = false;
            openBtn.textContent = originalText;
            msgDiv.textContent = 'A nova aba foi fechada antes de o arquivo ser aberto.';
            return;
          }

          if (signedFileUrl && typeof signedFileUrl === 'string') {
            let navigationSucceeded = false;
            try {
              popup.location.replace(signedFileUrl);
              navigationSucceeded = true;
            } catch (e) {
              try {
                popup.location.href = signedFileUrl;
                navigationSucceeded = true;
              } catch (err2) {
                navigationSucceeded = false;
              }
            }

            if (navigationSucceeded) {
              openBtn.disabled = false;
              openBtn.textContent = originalText;
            } else {
              if (popup && !popup.closed) {
                try { popup.close(); } catch (e) {}
              }
              openBtn.disabled = false;
              openBtn.textContent = originalText;
              msgDiv.textContent = 'Não foi possível abrir este arquivo.';
            }
          } else {
            if (popup && !popup.closed) {
              try { popup.close(); } catch (e) {}
            }
            openBtn.disabled = false;
            openBtn.textContent = originalText;
            msgDiv.textContent = 'Não foi possível abrir este arquivo.';
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
