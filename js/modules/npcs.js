/**
 * CHRONUS — NPCs Module (Dossiê de NPCs)
 * Renderização cinematográfica da rota #/npcs com retratos assinados.
 *
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getNpcs().
 * 2. Resolve assets privados exclusivamente via window.ChronusAssets.getSignedUrl().
 * 3. Conteúdo textual real é inserido com textContent, nunca como HTML do Supabase.
 * 4. Protegido contra race conditions via requestId e validação da rota ativa.
 */
window.ChronusNpcs = (function() {
  'use strict';

  const STYLESHEET = 'css/cinematic-npcs-page-v13.css';
  let currentRequestId = 0;

  const STATUS_MAP = {
    alive: { label: 'Vivo', class: 'status-alive' },
    dead: { label: 'Morto', class: 'status-dead' },
    missing: { label: 'Desaparecido', class: 'status-missing' },
    unknown: { label: 'Desconhecido', class: 'status-unknown' },
    transformed: { label: 'Transformado', class: 'status-transformed' }
  };

  function isRequestCurrent(requestId) {
    return requestId === currentRequestId && window.ChronusRouter?.getCurrentRoute?.() === '#/npcs';
  }

  function init() {
    setupStyles();
    setupPageChrome();
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/npcs') load();
    });
  }

  function setupStyles() {
    if (document.querySelector('link[data-chronus-v13-npcs-page="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET;
    link.dataset.chronusV13NpcsPage = 'true';
    document.head.appendChild(link);
  }

  function setupPageChrome() {
    const view = document.getElementById('view-npcs');
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return;

    view.classList.add('npcs-internal-v13');
    if (!head.querySelector('.npcs-page-context-v13')) {
      const context = document.createElement('div');
      context.className = 'npcs-page-context-v13';
      context.textContent = 'Berlim · Arquivo de campo · identidades catalogadas';
      head.prepend(context);
    }
  }

  async function load() {
    const container = document.getElementById('npcs-list-container');
    if (!container) return;

    setupPageChrome();
    const requestId = ++currentRequestId;
    renderLoading(container);

    try {
      const npcs = await window.ChronusContent.getNpcs();
      if (!isRequestCurrent(requestId)) return;

      if (!npcs || npcs.length === 0) renderEmpty(container);
      else await renderNpcs(container, npcs, requestId);
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [NpcsModule]: Falha ao carregar NPCs:', err);
      renderError(container);
    }
  }

  function createStateShell(mark, titleText, descText) {
    const box = document.createElement('div');
    box.className = 'npcs-page-state-v13';
    const inner = document.createElement('div');
    inner.className = 'npcs-page-state-inner-v13';
    const sigil = document.createElement('div');
    sigil.className = 'npcs-page-state-mark-v13';
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
    const { box, inner } = createStateShell('◉', 'Abrindo o dossiê de campo', 'Recuperando somente os registros e retratos permitidos para o seu perfil...');
    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';
    inner.prepend(spinner);
    container.appendChild(box);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const { box } = createStateShell('◇', 'Nenhum NPC disponível', 'Os contatos, aliados, suspeitos e entidades aparecerão aqui quando estiverem disponíveis para o seu perfil.');
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('×', 'Não foi possível abrir o dossiê', 'Ocorreu uma instabilidade na conexão. Tente novamente em instantes.');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());
    inner.appendChild(btn);
    container.appendChild(box);
  }

  async function resolveNpcAssets(npcs, requestId) {
    return Promise.all(npcs.map(async (npc) => {
      let signedUrl = null;
      if (npc.portrait_path && typeof npc.portrait_path === 'string' && npc.portrait_path.trim()) {
        try {
          signedUrl = await window.ChronusAssets?.getSignedUrl?.('campaign-images', npc.portrait_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [NpcsModule]: Falha ao resolver retrato do NPC');
        }
      }
      return { npc, signedUrl, stale: !isRequestCurrent(requestId) };
    }));
  }

  async function renderNpcs(container, npcs, requestId) {
    const npcsWithAssets = await resolveNpcAssets(npcs, requestId);
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const validEntries = npcsWithAssets.filter(entry => !entry.stale);
    container.appendChild(buildSummary(validEntries.map(entry => entry.npc)));

    const grid = document.createElement('div');
    grid.className = 'npcs-page-grid-v13';
    validEntries.forEach(({ npc, signedUrl }, index) => {
      grid.appendChild(buildNpcCard(npc, signedUrl, index));
    });
    container.appendChild(grid);
  }

  function buildSummary(npcs) {
    const summary = document.createElement('section');
    summary.className = 'npcs-page-summary-v13';
    summary.setAttribute('aria-label', 'Resumo do dossiê disponível');

    const knownFactions = new Set(npcs.map(npc => npc.faction).filter(Boolean));
    const missing = npcs.filter(npc => npc.status === 'missing' || npc.status === 'unknown').length;
    const withPortrait = npcs.filter(npc => npc.portrait_path).length;

    const items = [
      ['Registros disponíveis', String(npcs.length)],
      ['Facções catalogadas', String(knownFactions.size)],
      ['Status incerto', String(missing)],
      ['Retratos disponíveis', `${withPortrait} de ${npcs.length}`]
    ];

    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'npcs-page-summary-item-v13';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(span, strong);
      summary.appendChild(item);
    });
    return summary;
  }

  function buildNpcCard(npc, signedUrl, index) {
    const card = document.createElement('article');
    card.className = 'npcs-page-card-v13';
    if (index === 0) card.classList.add('is-featured');

    const portrait = document.createElement('div');
    portrait.className = 'npcs-page-portrait-v13';
    if (signedUrl && typeof signedUrl === 'string') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = npc.name ? `Retrato de ${npc.name}` : 'Retrato do NPC';
      img.src = signedUrl;
      portrait.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'npcs-page-portrait-fallback-v13';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = '◉';
      portrait.appendChild(fallback);
    }

    const code = document.createElement('span');
    code.className = 'npcs-page-file-code-v13';
    code.textContent = npc.slug ? `DOS · ${npc.slug}` : `DOS · ${String(index + 1).padStart(3, '0')}`;
    portrait.appendChild(code);

    const body = document.createElement('div');
    body.className = 'npcs-page-body-v13';

    const top = document.createElement('div');
    top.className = 'npcs-page-topline-v13';
    const role = document.createElement('span');
    role.className = 'npcs-page-role-v13';
    role.textContent = npc.role_occupation || 'Figura da Crônica';
    top.appendChild(role);

    const statusInfo = STATUS_MAP[npc.status] || { label: npc.status || 'Desconhecido', class: 'status-unknown' };
    const status = document.createElement('span');
    status.className = `npcs-page-status-v13 ${statusInfo.class}`;
    status.textContent = statusInfo.label;
    top.appendChild(status);

    const name = document.createElement('h3');
    name.className = 'npcs-page-name-v13';
    name.textContent = npc.name || 'NPC sem nome';
    body.append(top, name);

    if (npc.public_description) {
      const desc = document.createElement('p');
      desc.className = 'npcs-page-description-v13';
      desc.textContent = npc.public_description;
      body.appendChild(desc);
    }

    const facts = [];
    if (npc.faction) facts.push(['Facção', npc.faction]);
    if (npc.apparent_age) facts.push(['Idade aparente', npc.apparent_age]);
    if (facts.length) {
      const factsWrap = document.createElement('div');
      factsWrap.className = 'npcs-page-facts-v13';
      facts.forEach(([label, value]) => {
        const fact = document.createElement('div');
        fact.className = 'npcs-page-fact-v13';
        const span = document.createElement('span');
        span.textContent = label;
        const strong = document.createElement('strong');
        strong.textContent = value;
        fact.append(span, strong);
        factsWrap.appendChild(fact);
      });
      body.appendChild(factsWrap);
    }

    const notes = document.createElement('div');
    notes.className = 'npcs-page-profile-details-v13';
    if (npc.known_personality) notes.appendChild(buildNote('Personalidade conhecida', npc.known_personality));
    if (npc.relationship_to_group) notes.appendChild(buildNote('Relação com o grupo', npc.relationship_to_group));
    if (notes.childElementCount) body.appendChild(notes);

    const meta = document.createElement('div');
    meta.className = 'npcs-page-meta-v13';
    meta.appendChild(buildMetaChip(npc.visibility ? `Visibilidade · ${npc.visibility}` : 'Visibilidade · padrão'));
    meta.appendChild(buildMetaChip(npc.published === false ? 'Não publicado' : 'Publicado', npc.published === false));
    body.appendChild(meta);

    card.append(portrait, body);
    return card;
  }

  function buildNote(labelText, valueText) {
    const note = document.createElement('div');
    note.className = 'npcs-page-note-v13';
    const label = document.createElement('strong');
    label.textContent = `${labelText}: `;
    note.append(label, document.createTextNode(valueText));
    return note;
  }

  function buildMetaChip(text, isDraft = false) {
    const chip = document.createElement('span');
    chip.className = 'npcs-page-meta-chip-v13';
    if (isDraft) chip.classList.add('is-draft');
    chip.textContent = text;
    return chip;
  }

  return { init, load };
})();
