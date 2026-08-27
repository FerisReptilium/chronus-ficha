/**
 * CHRONUS — Sessions Module (Diário de Sessões)
 * Renderização cinematográfica da rota #/sessions com suporte a capas assinadas.
 *
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getSessions().
 * 2. Resolve assets privados exclusivamente via window.ChronusAssets.getSignedUrl().
 * 3. Datas, resumos, eventos e pistas reais são inseridos com textContent, nunca como HTML do Supabase.
 * 4. Formatação segura de datas e fallback para valores inválidos.
 * 5. Protegido contra race conditions via requestId e validação da rota ativa.
 */
window.ChronusSessions = (function() {
  'use strict';

  const STYLESHEET = 'css/cinematic-sessions-page-v13.css';
  let currentRequestId = 0;

  const STATUS_MAP = {
    completed: { label: 'Concluída', class: 'status-completed' },
    in_progress: { label: 'Em Andamento', class: 'status-in-progress' },
    planned: { label: 'Planejada', class: 'status-planned' },
    canceled: { label: 'Cancelada', class: 'status-canceled' }
  };

  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/sessions'
    );
  }

  function init() {
    setupStyles();
    setupPageChrome();

    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/sessions') load();
    });
  }

  function setupStyles() {
    if (document.querySelector('link[data-chronus-v13-sessions-page="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET;
    link.dataset.chronusV13SessionsPage = 'true';
    document.head.appendChild(link);
  }

  function setupPageChrome() {
    const view = document.getElementById('view-sessions');
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return;

    view.classList.add('sessions-internal-v13');

    if (!head.querySelector('.sessions-page-context-v13')) {
      const context = document.createElement('div');
      context.className = 'sessions-page-context-v13';
      context.textContent = 'Berlim · Diário de campo · cronologia da investigação';
      head.prepend(context);
    }
  }

  async function load() {
    const container = document.getElementById('sessions-list-container');
    if (!container) return;

    setupPageChrome();
    const requestId = ++currentRequestId;
    renderLoading(container);

    try {
      const sessions = await window.ChronusContent.getSessions();
      if (!isRequestCurrent(requestId)) return;

      if (!sessions || sessions.length === 0) {
        renderEmpty(container);
      } else {
        await renderSessions(container, sessions, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [SessionsModule]: Falha ao carregar sessões:', err);
      renderError(container);
    }
  }

  function createStateShell(mark, titleText, descText) {
    const box = document.createElement('div');
    box.className = 'sessions-page-state-v13';

    const inner = document.createElement('div');
    inner.className = 'sessions-page-state-inner-v13';

    const sigil = document.createElement('div');
    sigil.className = 'sessions-page-state-mark-v13';
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
    const { box, inner } = createStateShell('▣', 'Abrindo o Diário de Sessões', 'Recuperando registros, datas, eventos, pistas e capas permitidos para o seu perfil...');
    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';
    inner.prepend(spinner);
    container.appendChild(box);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const { box } = createStateShell('◇', 'Nenhuma sessão disponível', 'Os registros das sessões aparecerão aqui quando estiverem disponíveis para o seu perfil.');
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('×', 'Não foi possível abrir o Diário', 'Ocorreu uma instabilidade na conexão. Tente novamente em instantes.');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());
    inner.appendChild(btn);
    container.appendChild(box);
  }

  function formatSessionDate(dateVal) {
    if (!dateVal || typeof dateVal !== 'string') return null;
    const match = dateVal.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const date = new Date(year, month, day);

    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    return null;
  }

  async function resolveSessionAssets(sessions, requestId) {
    return Promise.all(sessions.map(async (session) => {
      let signedUrl = null;
      if (session.cover_image_path && typeof session.cover_image_path === 'string' && session.cover_image_path.trim()) {
        try {
          signedUrl = await window.ChronusAssets?.getSignedUrl?.('campaign-images', session.cover_image_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [SessionsModule]: Falha ao resolver asset de capa da sessão');
        }
      }

      return {
        session,
        signedUrl,
        stale: !isRequestCurrent(requestId)
      };
    }));
  }

  async function renderSessions(container, sessions, requestId) {
    const sessionsWithAssets = await resolveSessionAssets(sessions, requestId);
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';

    const validEntries = sessionsWithAssets.filter(entry => !entry.stale);
    const records = validEntries.map(entry => entry.session);
    container.appendChild(buildSummary(records));

    const timeline = document.createElement('div');
    timeline.className = 'sessions-page-timeline-v13';

    validEntries.forEach(({ session, signedUrl }, index) => {
      timeline.appendChild(buildSessionEntry(session, signedUrl, index));
    });

    container.appendChild(timeline);
  }

  function buildSummary(sessions) {
    const summary = document.createElement('section');
    summary.className = 'sessions-page-summary-v13';
    summary.setAttribute('aria-label', 'Resumo das sessões disponíveis');

    const completed = sessions.filter(session => session.status === 'completed').length;
    const withClues = sessions.filter(session => typeof session.clues_uncovered === 'string' && session.clues_uncovered.trim()).length;
    const numbered = sessions.map(session => Number(session.session_number)).filter(Number.isFinite);
    const latest = numbered.length ? Math.max(...numbered) : null;

    const items = [
      ['Registros disponíveis', String(sessions.length)],
      ['Sessões concluídas', String(completed)],
      ['Com pistas registradas', String(withClues)],
      ['Número mais recente', latest == null ? 'Sem numeração' : `Sessão ${latest}`]
    ];

    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'sessions-page-summary-item-v13';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(span, strong);
      summary.appendChild(item);
    });

    return summary;
  }

  function buildSessionEntry(session, signedUrl, index) {
    const article = document.createElement('article');
    article.className = 'sessions-page-entry-v13';
    if (index === 0) article.classList.add('is-latest');

    const cover = document.createElement('div');
    cover.className = 'sessions-page-cover-v13';

    if (signedUrl && typeof signedUrl === 'string') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = session.title ? `Capa de ${session.title}` : 'Capa da sessão';
      img.src = signedUrl;
      cover.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'sessions-page-cover-fallback-v13';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = '▣';
      cover.appendChild(fallback);
    }

    const code = document.createElement('span');
    code.className = 'sessions-page-cover-code-v13';
    code.textContent = session.slug ? `REG · ${session.slug}` : `REG · ${String(index + 1).padStart(3, '0')}`;
    cover.appendChild(code);

    const body = document.createElement('div');
    body.className = 'sessions-page-entry-body-v13';

    const topLine = document.createElement('div');
    topLine.className = 'sessions-page-topline-v13';

    const kicker = document.createElement('div');
    kicker.className = 'sessions-page-entry-kicker-v13';
    kicker.textContent = session.session_number == null ? 'Sessão sem número' : `Sessão ${session.session_number}`;

    const statusInfo = STATUS_MAP[session.status] || { label: session.status || 'Registrada', class: '' };
    const status = document.createElement('span');
    status.className = `sessions-page-status-v13 ${statusInfo.class}`.trim();
    status.textContent = statusInfo.label;

    topLine.append(kicker, status);

    const title = document.createElement('h3');
    title.className = 'sessions-page-entry-title-v13';
    title.textContent = session.title || 'Sessão sem título';

    body.append(topLine, title);

    const formattedRealDate = formatSessionDate(session.session_date);
    if (formattedRealDate || session.in_game_date) {
      const dates = document.createElement('div');
      dates.className = 'sessions-page-dates-v13';

      if (formattedRealDate) {
        const realDate = document.createElement('span');
        realDate.className = 'sessions-page-date-v13';
        realDate.textContent = `Mesa · ${formattedRealDate}`;
        dates.appendChild(realDate);
      }

      if (session.in_game_date) {
        const gameDate = document.createElement('span');
        gameDate.className = 'sessions-page-date-v13';
        gameDate.textContent = `Na narrativa · ${session.in_game_date}`;
        dates.appendChild(gameDate);
      }

      body.appendChild(dates);
    }

    if (session.summary) {
      const sessionSummary = document.createElement('p');
      sessionSummary.className = 'sessions-page-entry-summary-v13';
      sessionSummary.textContent = session.summary;
      body.appendChild(sessionSummary);
    }

    const meta = document.createElement('div');
    meta.className = 'sessions-page-entry-meta-v13';
    meta.appendChild(buildMetaChip(session.visibility ? `Visibilidade · ${session.visibility}` : 'Visibilidade · padrão'));
    meta.appendChild(buildMetaChip(session.published === false ? 'Não publicada' : 'Publicada', session.published === false));
    if (session.cover_image_path) meta.appendChild(buildMetaChip('Capa catalogada'));
    body.appendChild(meta);

    const investigation = buildInvestigationBlocks(session);
    if (investigation) body.appendChild(investigation);

    article.append(cover, body);
    return article;
  }

  function buildInvestigationBlocks(session) {
    const hasEvents = typeof session.events_log === 'string' && session.events_log.trim();
    const hasClues = typeof session.clues_uncovered === 'string' && session.clues_uncovered.trim();
    if (!hasEvents && !hasClues) return null;

    const wrap = document.createElement('div');
    wrap.className = 'sessions-page-investigation-v13';

    if (hasEvents) {
      wrap.appendChild(buildRecordDetails('Eventos registrados', session.events_log, false));
    }

    if (hasClues) {
      wrap.appendChild(buildRecordDetails('Pistas descobertas', session.clues_uncovered, true));
    }

    return wrap;
  }

  function buildRecordDetails(label, text, isClues) {
    const details = document.createElement('details');
    details.className = 'sessions-page-details-v13';
    if (isClues) details.classList.add('is-clues');

    const summary = document.createElement('summary');
    summary.textContent = label;

    const content = document.createElement('p');
    content.className = 'sessions-page-record-text-v13';
    content.textContent = text;

    details.append(summary, content);
    return details;
  }

  function buildMetaChip(text, isDraft = false) {
    const chip = document.createElement('span');
    chip.className = 'sessions-page-meta-chip-v13';
    if (isDraft) chip.classList.add('is-draft');
    chip.textContent = text;
    return chip;
  }

  return { init, load };
})();
