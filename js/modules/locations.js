/**
 * CHRONUS — Locations Module (Atlas & Locais)
 * Renderização cinematográfica da rota #/maps com suporte a imagens e mapas assinados.
 *
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getLocations().
 * 2. Resolve assets privados exclusivamente via window.ChronusAssets.getSignedUrl().
 *    - image_path -> bucket 'campaign-images'
 *    - map_image_path -> bucket 'maps'
 * 3. Manipula conteúdo do Supabase com document.createElement/textContent, nunca HTML cru.
 * 4. Protegido contra race conditions via requestId incremental e validação da rota ativa.
 * 5. A hierarquia usa somente locais já retornados pelo RLS; UUIDs não são exibidos.
 */
window.ChronusLocations = (function() {
  'use strict';

  const STYLESHEET = 'css/cinematic-locations-page-v13.css';
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

  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/maps'
    );
  }

  function init() {
    setupStyles();
    setupPageChrome();

    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/maps') load();
    });
  }

  function setupStyles() {
    if (document.querySelector('link[data-chronus-v13-locations-page="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET;
    link.dataset.chronusV13LocationsPage = 'true';
    document.head.appendChild(link);
  }

  function setupPageChrome() {
    const view = document.getElementById('view-maps');
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return;

    view.classList.add('locations-internal-v13');

    if (!head.querySelector('.locations-page-context-v13')) {
      const context = document.createElement('div');
      context.className = 'locations-page-context-v13';
      context.textContent = 'Berlim · Atlas de campo · cartografia autorizada';
      head.prepend(context);
    }
  }

  async function load() {
    const container = document.getElementById('locations-list-container');
    if (!container) return;

    setupPageChrome();
    const requestId = ++currentRequestId;
    renderLoading(container);

    try {
      const locations = await window.ChronusContent.getLocations();
      if (!isRequestCurrent(requestId)) return;

      if (!locations || locations.length === 0) {
        renderEmpty(container);
      } else {
        await renderLocations(container, locations, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [LocationsModule]: Falha ao carregar locais:', err);
      renderError(container);
    }
  }

  function createStateShell(mark, titleText, descText) {
    const box = document.createElement('div');
    box.className = 'locations-page-state-v13';

    const inner = document.createElement('div');
    inner.className = 'locations-page-state-inner-v13';

    const sigil = document.createElement('div');
    sigil.className = 'locations-page-state-mark-v13';
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
    const { box, inner } = createStateShell('⌖', 'Abrindo o Atlas da Crônica', 'Recuperando locais, mapas e imagens permitidos para o seu perfil...');
    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';
    inner.prepend(spinner);
    container.appendChild(box);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const { box } = createStateShell('◇', 'Nenhum local catalogado', 'Os territórios e pontos de interesse aparecerão aqui quando estiverem disponíveis para o seu perfil.');
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('×', 'Não foi possível abrir o Atlas', 'Ocorreu uma instabilidade ao consultar os locais da campanha. Tente novamente em instantes.');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());
    inner.appendChild(btn);
    container.appendChild(box);
  }

  function formatType(typeVal) {
    if (!typeVal) return 'Local';
    return TYPE_MAP[typeVal] || typeVal;
  }

  async function resolveLocationAssets(locations, requestId) {
    return Promise.all(locations.map(async (loc) => {
      const [signedImageUrl, signedMapUrl] = await Promise.all([
        (async () => {
          if (!loc.image_path || typeof loc.image_path !== 'string' || !loc.image_path.trim()) return null;
          try {
            return await window.ChronusAssets?.getSignedUrl?.('campaign-images', loc.image_path, { expiresIn: 3600 });
          } catch (err) {
            console.error('CHRONUS [LocationsModule]: Falha ao resolver imagem do local');
            return null;
          }
        })(),
        (async () => {
          if (!loc.map_image_path || typeof loc.map_image_path !== 'string' || !loc.map_image_path.trim()) return null;
          try {
            return await window.ChronusAssets?.getSignedUrl?.('maps', loc.map_image_path, { expiresIn: 3600 });
          } catch (err) {
            console.error('CHRONUS [LocationsModule]: Falha ao resolver mapa do local');
            return null;
          }
        })()
      ]);

      return {
        loc,
        signedImageUrl,
        signedMapUrl,
        stale: !isRequestCurrent(requestId)
      };
    }));
  }

  async function renderLocations(container, locations, requestId) {
    const entries = await resolveLocationAssets(locations, requestId);
    if (!isRequestCurrent(requestId)) return;

    const validEntries = entries.filter(entry => !entry.stale);
    const visibleLocations = validEntries.map(entry => entry.loc);
    const locationById = new Map(visibleLocations.map(loc => [loc.id, loc]));

    container.innerHTML = '';
    container.appendChild(buildSummary(visibleLocations));

    const atlas = document.createElement('div');
    atlas.className = 'locations-page-atlas-v13';

    validEntries.forEach((entry, index) => {
      atlas.appendChild(buildLocationEntry(entry, index, locationById, visibleLocations));
    });

    container.appendChild(atlas);
  }

  function buildSummary(locations) {
    const summary = document.createElement('section');
    summary.className = 'locations-page-summary-v13';
    summary.setAttribute('aria-label', 'Resumo do Atlas disponível');

    const types = new Set(locations.map(loc => loc.type).filter(Boolean));
    const regions = new Set(locations.map(loc => loc.district_region).filter(Boolean));
    const mapped = locations.filter(loc => loc.map_image_path).length;

    const items = [
      ['Locais disponíveis', String(locations.length)],
      ['Tipos catalogados', String(types.size)],
      ['Regiões identificadas', String(regions.size)],
      ['Mapas associados', `${mapped} de ${locations.length}`]
    ];

    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'locations-page-summary-item-v13';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(span, strong);
      summary.appendChild(item);
    });

    return summary;
  }

  function buildLocationEntry(entry, index, locationById, allLocations) {
    const { loc, signedImageUrl, signedMapUrl } = entry;
    const article = document.createElement('article');
    article.className = 'locations-page-entry-v13';
    if (index === 0) article.classList.add('is-featured');

    const visual = document.createElement('div');
    visual.className = 'locations-page-visual-v13';

    const primary = document.createElement('div');
    primary.className = 'locations-page-image-v13';

    if (signedImageUrl && typeof signedImageUrl === 'string') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = loc.name ? `Imagem de ${loc.name}` : 'Imagem do local';
      img.src = signedImageUrl;
      primary.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'locations-page-image-fallback-v13';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = '⌖';
      primary.appendChild(fallback);
    }

    const code = document.createElement('span');
    code.className = 'locations-page-file-code-v13';
    code.textContent = loc.slug ? `SETOR · ${loc.slug}` : `SETOR · ${String(index + 1).padStart(3, '0')}`;
    primary.appendChild(code);
    visual.appendChild(primary);

    if (signedMapUrl && typeof signedMapUrl === 'string') {
      const mapFigure = document.createElement('figure');
      mapFigure.className = 'locations-page-map-v13';
      const mapImg = document.createElement('img');
      mapImg.loading = 'lazy';
      mapImg.decoding = 'async';
      mapImg.alt = loc.name ? `Mapa de ${loc.name}` : 'Mapa do local';
      mapImg.src = signedMapUrl;
      const caption = document.createElement('figcaption');
      caption.textContent = 'Cartografia associada ao registro';
      mapFigure.append(mapImg, caption);
      visual.appendChild(mapFigure);
    }

    const body = document.createElement('div');
    body.className = 'locations-page-body-v13';

    const topline = document.createElement('div');
    topline.className = 'locations-page-topline-v13';

    const type = document.createElement('span');
    type.className = 'locations-page-type-v13';
    type.textContent = formatType(loc.type);
    topline.appendChild(type);

    if (loc.district_region) {
      const region = document.createElement('span');
      region.className = 'locations-page-region-v13';
      region.textContent = loc.district_region;
      topline.appendChild(region);
    }

    const name = document.createElement('h3');
    name.className = 'locations-page-name-v13';
    name.textContent = loc.name || 'Local sem nome';

    body.append(topline, name);

    if (loc.narrative_address) {
      const address = document.createElement('div');
      address.className = 'locations-page-address-v13';
      const label = document.createElement('strong');
      label.textContent = 'Referência narrativa';
      const text = document.createElement('span');
      text.textContent = loc.narrative_address;
      address.append(label, text);
      body.appendChild(address);
    }

    if (loc.public_description) {
      const desc = document.createElement('p');
      desc.className = 'locations-page-description-v13';
      desc.textContent = loc.public_description;
      body.appendChild(desc);
    }

    const hierarchy = buildHierarchy(loc, locationById, allLocations);
    if (hierarchy) body.appendChild(hierarchy);

    const meta = document.createElement('div');
    meta.className = 'locations-page-meta-v13';
    meta.appendChild(buildMetaChip(loc.visibility ? `Visibilidade · ${loc.visibility}` : 'Visibilidade · padrão'));
    meta.appendChild(buildMetaChip(loc.published === false ? 'Não publicado' : 'Publicado', loc.published === false));
    meta.appendChild(buildMetaChip(signedMapUrl ? 'Mapa · disponível' : 'Mapa · não associado'));
    if (signedImageUrl) meta.appendChild(buildMetaChip('Imagem · catalogada'));
    body.appendChild(meta);

    article.append(visual, body);
    return article;
  }

  function buildHierarchy(loc, locationById, allLocations) {
    const parent = loc.parent_location_id ? locationById.get(loc.parent_location_id) : null;
    const children = allLocations.filter(candidate => candidate.parent_location_id === loc.id);
    if (!loc.parent_location_id && children.length === 0) return null;

    const block = document.createElement('div');
    block.className = 'locations-page-hierarchy-v13';

    const title = document.createElement('strong');
    title.className = 'locations-page-hierarchy-title-v13';
    title.textContent = 'Hierarquia cartográfica';
    block.appendChild(title);

    if (loc.parent_location_id) {
      const row = document.createElement('div');
      row.className = 'locations-page-hierarchy-row-v13';
      const label = document.createElement('span');
      label.textContent = 'Inserido em';
      const value = document.createElement('strong');
      value.textContent = parent?.name || 'Referência superior não disponível neste acesso';
      row.append(label, value);
      block.appendChild(row);
    }

    if (children.length > 0) {
      const row = document.createElement('div');
      row.className = 'locations-page-hierarchy-row-v13';
      const label = document.createElement('span');
      label.textContent = 'Subáreas visíveis';
      const value = document.createElement('strong');
      value.textContent = children.map(child => child.name || 'Local sem nome').join(' · ');
      row.append(label, value);
      block.appendChild(row);
    }

    return block;
  }

  function buildMetaChip(text, isDraft = false) {
    const chip = document.createElement('span');
    chip.className = 'locations-page-meta-chip-v13';
    if (isDraft) chip.classList.add('is-draft');
    chip.textContent = text;
    return chip;
  }

  return {
    init,
    load
  };
})();
