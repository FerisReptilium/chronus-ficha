/**
 * CHRONUS — Library Module (Biblioteca Oficial)
 * Renderização cinematográfica da rota #/library com capas assinadas e
 * abertura controlada de arquivos privados.
 *
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getLibraryItems().
 * 2. Resolve capa (cover_path) via signed URL de 1h no bucket 'library'.
 * 3. Resolve file_path via signed URL de 5min SOMENTE após clique explícito.
 * 4. file_path nunca é assinado durante a montagem nem inserido no DOM/HTML.
 * 5. Todo conteúdo textual do Supabase usa textContent/createTextNode, nunca HTML cru.
 * 6. Protegido contra race conditions via requestId e validação da rota ativa.
 * 7. RLS permanece autoridade única sobre quais itens chegam ao frontend.
 */
window.ChronusLibrary = (function() {
  'use strict';

  const STYLESHEET = 'css/cinematic-library-page-v13.css';
  let currentRequestId = 0;

  const CATEGORY_MAP = {
    'system_book': 'Livro do Sistema',
    'pocket_manual': 'Manual de Bolso',
    'quick_guide': 'Guia Rápido',
    'character_sheet': 'Ficha de Personagem',
    'supplement': 'Suplemento',
    'extra': 'Material Extra'
  };

  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/library'
    );
  }

  function init() {
    setupStyles();
    setupPageChrome();

    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/library') load();
    });
  }

  function setupStyles() {
    if (document.querySelector('link[data-chronus-v13-library-page="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET;
    link.dataset.chronusV13LibraryPage = 'true';
    document.head.appendChild(link);
  }

  function setupPageChrome() {
    const view = document.getElementById('view-library');
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return;

    view.classList.add('library-internal-v13');

    if (!head.querySelector('.library-page-context-v13')) {
      const context = document.createElement('div');
      context.className = 'library-page-context-v13';
      context.textContent = 'Acervo oficial · consulta restrita · materiais autorizados';
      head.prepend(context);
    }
  }

  async function load() {
    const container = document.getElementById('library-list-container');
    if (!container) return;

    setupPageChrome();
    const requestId = ++currentRequestId;
    renderLoading(container);

    try {
      const items = await window.ChronusContent.getLibraryItems();
      if (!isRequestCurrent(requestId)) return;

      if (!items || items.length === 0) {
        renderEmpty(container);
      } else {
        await renderLibrary(container, items, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [LibraryModule]: Falha ao carregar biblioteca:', err);
      renderError(container);
    }
  }

  function createStateShell(mark, titleText, descText) {
    const box = document.createElement('div');
    box.className = 'library-page-state-v13';

    const inner = document.createElement('div');
    inner.className = 'library-page-state-inner-v13';

    const sigil = document.createElement('div');
    sigil.className = 'library-page-state-mark-v13';
    sigil.textContent = mark;

    const title = document.createElement('h3');
    title.textContent = titleText;

    const desc = document.createElement('p');
    desc.textContent = descText;

    inner.append(sigil, title, desc);
    box.appendChild(inner);
    return { box, inner };
  }

  function renderLoading(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('▥', 'Abrindo o acervo oficial', 'Recuperando livros, manuais e materiais permitidos para o seu perfil...');
    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';
    inner.prepend(spinner);
    container.appendChild(box);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const { box } = createStateShell('◇', 'Nenhum item disponível', 'Manuais, suplementos e materiais oficiais aparecerão aqui quando forem liberados para o seu perfil.');
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('×', 'Não foi possível abrir a biblioteca', 'Ocorreu uma instabilidade ao consultar o acervo. Tente novamente em instantes.');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());
    inner.appendChild(btn);
    container.appendChild(box);
  }

  function formatCategory(catVal) {
    if (!catVal) return 'Material de Referência';
    return CATEGORY_MAP[catVal] || catVal;
  }

  function normalizeBytes(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function formatFileSize(value) {
    const bytes = normalizeBytes(value);
    if (bytes == null || bytes < 0) return null;
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${parseFloat(kb.toFixed(1))} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${parseFloat(mb.toFixed(1))} MB`;
    const gb = mb / 1024;
    return `${parseFloat(gb.toFixed(1))} GB`;
  }

  async function resolveCoverAssets(items, requestId) {
    return Promise.all(items.map(async (item) => {
      let signedCoverUrl = null;

      if (item.cover_path && typeof item.cover_path === 'string' && item.cover_path.trim()) {
        try {
          signedCoverUrl = await window.ChronusAssets?.getSignedUrl?.('library', item.cover_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [LibraryModule]: Falha ao resolver capa do item da biblioteca');
        }
      }

      return {
        item,
        signedCoverUrl,
        stale: !isRequestCurrent(requestId)
      };
    }));
  }

  async function renderLibrary(container, items, requestId) {
    const itemsWithAssets = await resolveCoverAssets(items, requestId);
    if (!isRequestCurrent(requestId)) return;

    const validEntries = itemsWithAssets.filter(entry => !entry.stale);
    const visibleItems = validEntries.map(entry => entry.item);

    container.innerHTML = '';
    container.appendChild(buildSummary(visibleItems));

    const shelf = document.createElement('div');
    shelf.className = 'library-page-shelf-v13';

    validEntries.forEach((entry, index) => {
      shelf.appendChild(buildLibraryEntry(entry, index, requestId));
    });

    container.appendChild(shelf);
  }

  function buildSummary(items) {
    const summary = document.createElement('section');
    summary.className = 'library-page-summary-v13';
    summary.setAttribute('aria-label', 'Resumo da biblioteca disponível');

    const categories = new Set(items.map(item => item.category).filter(Boolean));
    const withCovers = items.filter(item => item.cover_path).length;
    const totalPages = items.reduce((sum, item) => {
      const pages = Number(item.page_count);
      return Number.isInteger(pages) && pages > 0 ? sum + pages : sum;
    }, 0);

    const itemsSummary = [
      ['Itens disponíveis', String(items.length)],
      ['Categorias', String(categories.size)],
      ['Capas catalogadas', `${withCovers} de ${items.length}`],
      ['Páginas catalogadas', totalPages > 0 ? String(totalPages) : 'Não informado']
    ];

    itemsSummary.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'library-page-summary-item-v13';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(span, strong);
      summary.appendChild(item);
    });

    return summary;
  }

  function buildLibraryEntry(entry, index, requestId) {
    const { item, signedCoverUrl } = entry;
    const article = document.createElement('article');
    article.className = 'library-page-entry-v13';
    if (index === 0) article.classList.add('is-featured');

    const cover = document.createElement('div');
    cover.className = 'library-page-cover-v13';

    if (signedCoverUrl && typeof signedCoverUrl === 'string') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = item.title ? `Capa de ${item.title}` : 'Capa do item da biblioteca';
      img.src = signedCoverUrl;
      cover.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'library-page-cover-fallback-v13';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = getCategoryMark(item.category);
      cover.appendChild(fallback);
    }

    const code = document.createElement('span');
    code.className = 'library-page-code-v13';
    code.textContent = item.slug ? `ACERVO · ${item.slug}` : `ACERVO · ${String(index + 1).padStart(3, '0')}`;
    cover.appendChild(code);

    const body = document.createElement('div');
    body.className = 'library-page-body-v13';

    const topline = document.createElement('div');
    topline.className = 'library-page-topline-v13';

    const category = document.createElement('span');
    category.className = 'library-page-category-v13';
    category.textContent = formatCategory(item.category);
    topline.appendChild(category);

    if (item.version) {
      const version = document.createElement('span');
      version.className = 'library-page-version-v13';
      version.textContent = `Versão ${item.version}`;
      topline.appendChild(version);
    }

    const title = document.createElement('h3');
    title.className = 'library-page-title-v13';
    title.textContent = item.title || 'Item sem título';

    body.append(topline, title);

    if (item.description) {
      const desc = document.createElement('p');
      desc.className = 'library-page-description-v13';
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    const facts = buildFacts(item);
    if (facts) body.appendChild(facts);

    const meta = document.createElement('div');
    meta.className = 'library-page-meta-v13';
    meta.appendChild(buildMetaChip(item.visibility ? `Visibilidade · ${item.visibility}` : 'Visibilidade · padrão'));
    meta.appendChild(buildMetaChip(item.published === false ? 'Não publicado' : 'Publicado', item.published === false));
    meta.appendChild(buildMetaChip(signedCoverUrl ? 'Capa · disponível' : 'Capa · não associada'));
    meta.appendChild(buildMetaChip(item.file_path ? 'Arquivo · associado' : 'Arquivo · indisponível'));
    body.appendChild(meta);

    if (item.file_path && typeof item.file_path === 'string' && item.file_path.trim()) {
      body.appendChild(buildOpenFileAction(item, requestId));
    }

    article.append(cover, body);
    return article;
  }

  function buildFacts(item) {
    const formattedSize = formatFileSize(item.file_size_bytes);
    const pageCount = Number(item.page_count);
    const validPageCount = Number.isInteger(pageCount) && pageCount > 0;
    if (!formattedSize && !validPageCount) return null;

    const facts = document.createElement('div');
    facts.className = 'library-page-facts-v13';

    if (validPageCount) {
      facts.appendChild(buildFact('Extensão', pageCount === 1 ? '1 página' : `${pageCount} páginas`));
    }

    if (formattedSize) {
      facts.appendChild(buildFact('Tamanho do arquivo', formattedSize));
    }

    return facts;
  }

  function buildFact(labelText, valueText) {
    const fact = document.createElement('div');
    fact.className = 'library-page-fact-v13';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = valueText;
    fact.append(label, value);
    return fact;
  }

  function buildOpenFileAction(item, requestId) {
    const actions = document.createElement('div');
    actions.className = 'library-page-actions-v13';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'portal-btn portal-btn-secondary library-page-open-button-v13';
    openBtn.textContent = 'Abrir arquivo';

    const msg = document.createElement('div');
    msg.className = 'library-page-action-msg-v13';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');

    openBtn.addEventListener('click', async () => {
      msg.textContent = '';
      if (!isRequestCurrent(requestId)) return;

      let popup = null;
      try {
        popup = window.open('about:blank', '_blank');
        if (popup) popup.opener = null;
      } catch (e) {
        popup = null;
      }

      if (!popup) {
        msg.textContent = 'Não foi possível abrir uma nova aba. Verifique o bloqueio de pop-ups.';
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
      }

      if (!isRequestCurrent(requestId)) {
        if (popup && !popup.closed) {
          try { popup.close(); } catch (e) {}
        }
        return;
      }

      if (!popup || popup.closed) {
        openBtn.disabled = false;
        openBtn.textContent = originalText;
        msg.textContent = 'A nova aba foi fechada antes de o arquivo ser aberto.';
        return;
      }

      let navigationSucceeded = false;
      if (signedFileUrl && typeof signedFileUrl === 'string') {
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
      }

      if (!navigationSucceeded && popup && !popup.closed) {
        try { popup.close(); } catch (e) {}
      }

      openBtn.disabled = false;
      openBtn.textContent = originalText;
      if (!navigationSucceeded) msg.textContent = 'Não foi possível abrir este arquivo.';
    });

    actions.append(openBtn, msg);
    return actions;
  }

  function buildMetaChip(text, isDraft = false) {
    const chip = document.createElement('span');
    chip.className = 'library-page-meta-chip-v13';
    if (isDraft) chip.classList.add('is-draft');
    chip.textContent = text;
    return chip;
  }

  function getCategoryMark(category) {
    const marks = {
      system_book: '⌘',
      pocket_manual: '▤',
      quick_guide: '◇',
      character_sheet: '✦',
      supplement: '▥',
      extra: '·'
    };
    return marks[category] || '▧';
  }

  return {
    init,
    load
  };
})();
