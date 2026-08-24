/**
 * CHRONUS — NPCs Module (Dossiê de NPCs)
 * Renderização e controle de listagem de contatos e figuras da crônica.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getNpcs().
 * 2. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 3. Protegido contra race conditions via requestId incremental.
 */
window.ChronusNpcs = (function() {
  'use strict';

  let currentRequestId = 0;

  const STATUS_MAP = {
    'alive': { label: 'Vivo', class: 'status-alive' },
    'dead': { label: 'Morto', class: 'status-dead' },
    'missing': { label: 'Desaparecido', class: 'status-missing' },
    'unknown': { label: 'Desconhecido', class: 'status-unknown' },
    'transformed': { label: 'Transformado', class: 'status-transformed' }
  };

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/npcs') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('npcs-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const npcs = await window.ChronusContent.getNpcs();

      if (requestId !== currentRequestId) return;

      if (!npcs || npcs.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de NPCs
        renderNpcs(container, npcs);
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
      console.error('CHRONUS [NpcsModule]: Falha ao carregar NPCs:', err);
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
    text.textContent = 'Carregando dossiê de NPCs...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhum NPC disponível';

    const desc = document.createElement('p');
    desc.textContent = 'Os contatos, aliados e figuras da crônica aparecerão aqui quando estiverem disponíveis.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar o dossiê';

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

  function renderNpcs(container, npcs) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    npcs.forEach(npc => {
      const card = document.createElement('article');
      card.className = 'editorial-card content-card npc-card';

      const headerDiv = document.createElement('div');

      // Top row: Ocupação / Kicker + Status Badge
      const topRow = document.createElement('div');
      topRow.className = 'content-card-top-row';

      const kicker = document.createElement('span');
      kicker.className = 'section-kicker';
      kicker.textContent = npc.role_occupation || 'Figura da Crônica';
      topRow.appendChild(kicker);

      if (npc.status) {
        const statusInfo = STATUS_MAP[npc.status] || { label: npc.status || 'Desconhecido', class: 'status-unknown' };
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge-occult npc-status-badge ${statusInfo.class}`;
        statusBadge.textContent = statusInfo.label;
        topRow.appendChild(statusBadge);
      }

      headerDiv.appendChild(topRow);

      // Nome do NPC (Título)
      const name = document.createElement('h3');
      name.className = 'card-title-editorial';
      name.textContent = npc.name || 'NPC sem nome';
      headerDiv.appendChild(name);

      // Meta Tags (Facção, Idade Aparente, Relação com o Grupo)
      const hasFaction = Boolean(npc.faction);
      const hasAge = Boolean(npc.apparent_age);
      const hasRel = Boolean(npc.relationship_to_group);

      if (hasFaction || hasAge || hasRel) {
        const metaList = document.createElement('div');
        metaList.className = 'npc-meta-list';

        if (hasFaction) {
          const item = document.createElement('div');
          item.className = 'npc-meta-item';
          const label = document.createElement('strong');
          label.textContent = 'Facção: ';
          const val = document.createTextNode(npc.faction);
          item.appendChild(label);
          item.appendChild(val);
          metaList.appendChild(item);
        }

        if (hasAge) {
          const item = document.createElement('div');
          item.className = 'npc-meta-item';
          const label = document.createElement('strong');
          label.textContent = 'Idade aparente: ';
          const val = document.createTextNode(npc.apparent_age);
          item.appendChild(label);
          item.appendChild(val);
          metaList.appendChild(item);
        }

        if (hasRel) {
          const item = document.createElement('div');
          item.className = 'npc-meta-item';
          const label = document.createElement('strong');
          label.textContent = 'Relação: ';
          const val = document.createTextNode(npc.relationship_to_group);
          item.appendChild(label);
          item.appendChild(val);
          metaList.appendChild(item);
        }

        headerDiv.appendChild(metaList);
      }

      // Descrição Pública
      if (npc.public_description) {
        const desc = document.createElement('p');
        desc.className = 'card-text-body npc-public-desc';
        desc.textContent = npc.public_description;
        headerDiv.appendChild(desc);
      }

      // Personalidade Conhecida
      if (npc.known_personality) {
        const pers = document.createElement('p');
        pers.className = 'npc-personality-lead';
        const strong = document.createElement('strong');
        strong.textContent = 'Personalidade: ';
        const val = document.createTextNode(npc.known_personality);
        pers.appendChild(strong);
        pers.appendChild(val);
        headerDiv.appendChild(pers);
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
