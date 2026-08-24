/**
 * CHRONUS — Locations Module (Atlas & Locais)
 * Renderização e controle de listagem do atlas de locais da crônica.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getLocations().
 * 2. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 3. Protegido contra race conditions via requestId incremental.
 */
window.ChronusLocations = (function() {
  'use strict';

  let currentRequestId = 0;

  const TYPE_MAP = {
    'city': 'Cidade',
    'district': 'Distrito',
    'neighborhood': 'Bairro',
    'building': 'Edifício',
    'bunker': 'Bunker',
    'club': 'Clube',
    'facility': 'Instalação',
    'supernatural_domain': 'Domínio Sobrenatural',
    'battlemap': 'Mapa Tático',
    'street': 'Rua',
    'bar': 'Bar',
    'hotel': 'Hotel',
    'hospital': 'Hospital',
    'church': 'Igreja',
    'cemetery': 'Cemitério',
    'park': 'Parque',
    'forest': 'Floresta',
    'warehouse': 'Armazém',
    'station': 'Estação',
    'other': 'Outro'
  };

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/maps') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('locations-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const locations = await window.ChronusContent.getLocations();

      if (requestId !== currentRequestId) return;

      if (!locations || locations.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Locais
        renderLocations(container, locations);
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
      console.error('CHRONUS [LocationsModule]: Falha ao carregar locais:', err);
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
    text.textContent = 'Carregando atlas da crônica...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhum local disponível';

    const desc = document.createElement('p');
    desc.textContent = 'Os locais, territórios e pontos de interesse da crônica aparecerão aqui quando forem catalogados.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar o atlas';

    const desc = document.createElement('p');
    desc.textContent = 'Ocorreu uma instabilidade ao consultar os locais da campanha.';

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

  function formatType(typeVal) {
    if (!typeVal) return '';
    return TYPE_MAP[typeVal] || typeVal;
  }

  function renderLocations(container, locations) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    locations.forEach(loc => {
      const card = document.createElement('article');
      card.className = 'editorial-card content-card location-card';

      const headerDiv = document.createElement('div');

      // Top row: Tipo do Local + Região
      const topRow = document.createElement('div');
      topRow.className = 'content-card-top-row';

      if (loc.type) {
        const kicker = document.createElement('span');
        kicker.className = 'section-kicker';
        kicker.textContent = formatType(loc.type);
        topRow.appendChild(kicker);
      }

      if (loc.district_region) {
        const regionBadge = document.createElement('span');
        regionBadge.className = 'badge-occult location-region-badge';
        regionBadge.textContent = loc.district_region;
        topRow.appendChild(regionBadge);
      }

      if (topRow.childElementCount > 0) {
        headerDiv.appendChild(topRow);
      }

      // Nome do Local (Título)
      const name = document.createElement('h3');
      name.className = 'card-title-editorial';
      name.textContent = loc.name || 'Local sem nome';
      headerDiv.appendChild(name);

      // Endereço Narrativo
      if (loc.narrative_address) {
        const address = document.createElement('div');
        address.className = 'location-address';
        const iconSpan = document.createElement('span');
        iconSpan.textContent = '📍 ';
        const textSpan = document.createTextNode(loc.narrative_address);
        address.appendChild(iconSpan);
        address.appendChild(textSpan);
        headerDiv.appendChild(address);
      }

      // Descrição Pública
      if (loc.public_description) {
        const desc = document.createElement('p');
        desc.className = 'card-text-body location-public-desc';
        desc.textContent = loc.public_description;
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
