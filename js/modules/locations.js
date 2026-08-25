/**
 * CHRONUS — Locations Module (Atlas & Locais)
 * Renderização e controle de listagem do atlas de locais da crônica com suporte a imagens e mapas assinados.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getLocations().
 * 2. Resolve assets privados exclusivamente via window.ChronusAssets.getSignedUrl().
 *    - image_path -> bucket 'campaign-images'
 *    - map_image_path -> bucket 'maps'
 * 3. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 4. Protegido contra race conditions via requestId incremental e validação de rota ativa.
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

  /**
   * Valida se a requisição assíncrona ainda é a mais recente e se a rota ativa continua sendo Atlas & Locais.
   * @private
   * @param {number} requestId
   * @returns {boolean}
   */
  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/maps'
    );
  }

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

      if (!isRequestCurrent(requestId)) return;

      if (!locations || locations.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Locais com Resolução Segura de Assets
        await renderLocations(container, locations, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
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

  async function renderLocations(container, locations, requestId) {
    // 1. Resolver Signed URLs independentes para image_path e map_image_path
    const locationsWithAssets = await Promise.all(locations.map(async (loc) => {
      const [signedImageUrl, signedMapUrl] = await Promise.all([
        // Resolução de image_path -> bucket 'campaign-images'
        (async () => {
          if (loc.image_path && typeof loc.image_path === 'string' && loc.image_path.trim()) {
            try {
              return await window.ChronusAssets?.getSignedUrl?.('campaign-images', loc.image_path, { expiresIn: 3600 });
            } catch (err) {
              console.error('CHRONUS [LocationsModule]: Falha ao resolver imagem do local');
              return null;
            }
          }
          return null;
        })(),
        // Resolução de map_image_path -> bucket 'maps'
        (async () => {
          if (loc.map_image_path && typeof loc.map_image_path === 'string' && loc.map_image_path.trim()) {
            try {
              return await window.ChronusAssets?.getSignedUrl?.('maps', loc.map_image_path, { expiresIn: 3600 });
            } catch (err) {
              console.error('CHRONUS [LocationsModule]: Falha ao resolver mapa do local');
              return null;
            }
          }
          return null;
        })()
      ]);

      if (!isRequestCurrent(requestId)) {
        return { loc, signedImageUrl: null, signedMapUrl: null, stale: true };
      }

      return { loc, signedImageUrl, signedMapUrl, stale: false };
    }));

    // Guarda contra race condition pós-assinatura assíncrona
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    locationsWithAssets.forEach(({ loc, signedImageUrl, signedMapUrl, stale }) => {
      if (stale) return;

      const card = document.createElement('article');
      card.className = 'editorial-card content-card location-card';

      // 1. Imagem Principal do Local (se houver signed URL válida)
      if (signedImageUrl && typeof signedImageUrl === 'string') {
        const imageWrap = document.createElement('div');
        imageWrap.className = 'location-image-wrap';

        const img = document.createElement('img');
        img.className = 'location-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = loc.name ? `Imagem de ${loc.name}` : 'Imagem do local';
        img.src = signedImageUrl;

        imageWrap.appendChild(img);
        card.appendChild(imageWrap);
      }

      // 2. Cabeçalho Textual e Metadados
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

      // 3. Bloco de Mapa (se houver signed URL de mapa válida)
      if (signedMapUrl && typeof signedMapUrl === 'string') {
        const mapBlock = document.createElement('div');
        mapBlock.className = 'location-map-block';

        const mapLabel = document.createElement('div');
        mapLabel.className = 'location-map-label';
        mapLabel.textContent = 'Mapa';

        const mapWrap = document.createElement('div');
        mapWrap.className = 'location-map-wrap';

        const mapImg = document.createElement('img');
        mapImg.className = 'location-map-image';
        mapImg.loading = 'lazy';
        mapImg.decoding = 'async';
        mapImg.alt = loc.name ? `Mapa de ${loc.name}` : 'Mapa do local';
        mapImg.src = signedMapUrl;

        mapWrap.appendChild(mapImg);
        mapBlock.appendChild(mapLabel);
        mapBlock.appendChild(mapWrap);
        card.appendChild(mapBlock);
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
