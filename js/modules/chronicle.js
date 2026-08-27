/**
 * CHRONUS — Chronicle Module (Crônica dos Despertos)
 * Renderização cinematográfica da rota #/chronicle com suporte a capas assinadas.
 *
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getChapters().
 * 2. Resolve assets privados exclusivamente via window.ChronusAssets.getSignedUrl().
 * 3. Conteúdo textual real é inserido com textContent, nunca como HTML do Supabase.
 * 4. Protegido contra race conditions via requestId e validação da rota ativa.
 */
window.ChronusChronicle = (function() {
  'use strict';

  const STYLESHEET = 'css/cinematic-chronicle-page-v13.css';
  let currentRequestId = 0;

  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/chronicle'
    );
  }

  function init() {
    setupStyles();
    setupPageChrome();

    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/chronicle') load();
    });
  }

  function setupStyles() {
    if (document.querySelector('link[data-chronus-v13-chronicle-page="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET;
    link.dataset.chronusV13ChroniclePage = 'true';
    document.head.appendChild(link);
  }

  function setupPageChrome() {
    const view = document.getElementById('view-chronicle');
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return;

    view.classList.add('chronicle-internal-v13');

    if (!head.querySelector('.chronicle-page-context-v13')) {
      const context = document.createElement('div');
      context.className = 'chronicle-page-context-v13';
      context.textContent = 'Berlim · Arquivo narrativo · registros da mesa';
      head.prepend(context);
    }
  }

  async function load() {
    const container = document.getElementById('chronicle-list-container');
    if (!container) return;

    setupPageChrome();
    const requestId = ++currentRequestId;
    renderLoading(container);

    try {
      const chapters = await window.ChronusContent.getChapters();
      if (!isRequestCurrent(requestId)) return;

      if (!chapters || chapters.length === 0) {
        renderEmpty(container);
      } else {
        await renderChapters(container, chapters, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [ChronicleModule]: Falha ao carregar capítulos:', err);
      renderError(container);
    }
  }

  function createStateShell(mark, titleText, descText) {
    const box = document.createElement('div');
    box.className = 'chronicle-page-state-v13';

    const inner = document.createElement('div');
    inner.className = 'chronicle-page-state-inner-v13';

    const sigil = document.createElement('div');
    sigil.className = 'chronicle-page-state-mark-v13';
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
    const { box, inner } = createStateShell('✦', 'Abrindo o arquivo da Crônica', 'Recuperando capítulos e capas permitidos para o seu perfil...');
    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';
    inner.prepend(spinner);
    container.appendChild(box);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const { box } = createStateShell('◇', 'Nenhum capítulo publicado', 'Os registros da Crônica aparecerão aqui quando estiverem disponíveis para o seu perfil.');
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('×', 'Não foi possível abrir a Crônica', 'Ocorreu uma instabilidade na conexão. Tente novamente em instantes.');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());
    inner.appendChild(btn);
    container.appendChild(box);
  }

  async function resolveChapterAssets(chapters, requestId) {
    return Promise.all(chapters.map(async (chapter) => {
      let signedUrl = null;
      if (chapter.cover_image_path && typeof chapter.cover_image_path === 'string' && chapter.cover_image_path.trim()) {
        try {
          signedUrl = await window.ChronusAssets?.getSignedUrl?.('campaign-images', chapter.cover_image_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [ChronicleModule]: Falha ao resolver asset de capa do capítulo');
        }
      }

      return {
        chapter,
        signedUrl,
        stale: !isRequestCurrent(requestId)
      };
    }));
  }

  async function renderChapters(container, chapters, requestId) {
    const chaptersWithAssets = await resolveChapterAssets(chapters, requestId);
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';

    const validEntries = chaptersWithAssets.filter(entry => !entry.stale);
    const summary = buildSummary(validEntries.map(entry => entry.chapter));
    container.appendChild(summary);

    const timeline = document.createElement('div');
    timeline.className = 'chronicle-page-timeline-v13';

    validEntries.forEach(({ chapter, signedUrl }, index) => {
      timeline.appendChild(buildChapterEntry(chapter, signedUrl, index));
    });

    container.appendChild(timeline);
  }

  function buildSummary(chapters) {
    const summary = document.createElement('section');
    summary.className = 'chronicle-page-summary-v13';
    summary.setAttribute('aria-label', 'Resumo da Crônica disponível');

    const numbered = chapters.filter(chapter => chapter.chapter_number != null).map(chapter => Number(chapter.chapter_number)).filter(Number.isFinite);
    const highest = numbered.length ? Math.max(...numbered) : null;
    const withCovers = chapters.filter(chapter => chapter.cover_image_path).length;

    const items = [
      ['Registros disponíveis', String(chapters.length)],
      ['Capítulo mais recente', highest == null ? 'Prólogo / Especial' : `Capítulo ${highest}`],
      ['Capas catalogadas', `${withCovers} de ${chapters.length}`]
    ];

    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'chronicle-page-summary-item-v13';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(span, strong);
      summary.appendChild(item);
    });

    return summary;
  }

  function buildChapterEntry(chapter, signedUrl, index) {
    const article = document.createElement('article');
    article.className = 'chronicle-page-entry-v13';
    if (index === 0) article.classList.add('is-featured');

    const cover = document.createElement('div');
    cover.className = 'chronicle-page-cover-v13';

    if (signedUrl && typeof signedUrl === 'string') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = chapter.title ? `Capa de ${chapter.title}` : 'Capa do capítulo';
      img.src = signedUrl;
      cover.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'chronicle-page-cover-fallback-v13';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = '✦';
      cover.appendChild(fallback);
    }

    const code = document.createElement('span');
    code.className = 'chronicle-page-cover-code-v13';
    code.textContent = chapter.slug ? `ARQ · ${chapter.slug}` : `ARQ · ${String(index + 1).padStart(3, '0')}`;
    cover.appendChild(code);

    const body = document.createElement('div');
    body.className = 'chronicle-page-entry-body-v13';

    const kicker = document.createElement('div');
    kicker.className = 'chronicle-page-entry-kicker-v13';
    kicker.textContent = chapter.chapter_number == null ? 'Prólogo / Especial' : `Capítulo ${chapter.chapter_number}`;

    const title = document.createElement('h3');
    title.className = 'chronicle-page-entry-title-v13';
    title.textContent = chapter.title || 'Capítulo sem título';

    body.append(kicker, title);

    if (chapter.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.className = 'chronicle-page-entry-subtitle-v13';
      subtitle.textContent = chapter.subtitle;
      body.appendChild(subtitle);
    }

    if (chapter.summary) {
      const summary = document.createElement('p');
      summary.className = 'chronicle-page-entry-summary-v13';
      summary.textContent = chapter.summary;
      body.appendChild(summary);
    }

    const meta = document.createElement('div');
    meta.className = 'chronicle-page-entry-meta-v13';
    meta.appendChild(buildMetaChip(chapter.visibility ? `Visibilidade · ${chapter.visibility}` : 'Visibilidade · padrão'));
    meta.appendChild(buildMetaChip(chapter.published === false ? 'Não publicado' : 'Publicado', chapter.published === false));

    if (chapter.published_at) {
      const date = new Date(chapter.published_at);
      if (!Number.isNaN(date.getTime())) {
        meta.appendChild(buildMetaChip(`Data · ${date.toLocaleDateString('pt-BR')}`));
      }
    }

    body.appendChild(meta);

    if (chapter.content && typeof chapter.content === 'string' && chapter.content.trim()) {
      const details = document.createElement('details');
      details.className = 'chronicle-page-details-v13';
      const summaryControl = document.createElement('summary');
      summaryControl.textContent = 'Ler registro completo';
      const content = document.createElement('div');
      content.className = 'chronicle-page-content-v13';
      content.textContent = chapter.content;
      details.append(summaryControl, content);
      body.appendChild(details);
    }

    article.append(cover, body);
    return article;
  }

  function buildMetaChip(text, isDraft = false) {
    const chip = document.createElement('span');
    chip.className = 'chronicle-page-meta-chip-v13';
    if (isDraft) chip.classList.add('is-draft');
    chip.textContent = text;
    return chip;
  }

  return { init, load };
})();
