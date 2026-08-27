/**
 * CHRONUS — Home Page Module
 * Renderização e interatividade da página inicial cinematográfica.
 */
window.ChronusHome = (function() {
  const V13_STYLESHEET = 'css/cinematic-v13.css';
  const V13_SCENES_STYLESHEET = 'css/cinematic-scenes-v13.css';
  const V13_SESSIONS_STYLESHEET = 'css/cinematic-sessions-v13.css';
  const V13_NPCS_STYLESHEET = 'css/cinematic-npcs-v13.css';
  const V13_LOCATIONS_STYLESHEET = 'css/cinematic-locations-v13.css';
  const V13_FILES_STYLESHEET = 'css/cinematic-files-v13.css';
  const V13_LIBRARY_STYLESHEET = 'css/cinematic-library-v13.css';
  const V131_ART_PACK_STYLESHEET = 'css/art-pack-v131.css';
  const HERO_ART = 'assets/art/hero-berlin-1992.webp';

  function init() {
    setupV13Styles();
    setupCinematicHero();
    setupChronicleScene();
    setupSessionsScene();
    setupNpcsScene();
    setupLocationsScene();
    setupFilesScene();
    setupLibraryScene();
    setupHeroCta();
  }

  function appendStylesheetOnce(href, datasetKey, datasetValue) {
    if (document.querySelector(`link[data-${datasetKey}="${datasetValue}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[datasetKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = datasetValue;
    document.head.appendChild(link);
  }

  function setupV13Styles() {
    appendStylesheetOnce(V13_STYLESHEET, 'chronus-v13', 'cinematic');
    appendStylesheetOnce(V13_SCENES_STYLESHEET, 'chronus-v13-layer', 'scenes');
    appendStylesheetOnce(V13_SESSIONS_STYLESHEET, 'chronus-v13-layer', 'sessions');
    appendStylesheetOnce(V13_NPCS_STYLESHEET, 'chronus-v13-layer', 'npcs');
    appendStylesheetOnce(V13_LOCATIONS_STYLESHEET, 'chronus-v13-layer', 'locations');
    appendStylesheetOnce(V13_FILES_STYLESHEET, 'chronus-v13-layer', 'files');
    appendStylesheetOnce(V13_LIBRARY_STYLESHEET, 'chronus-v13-layer', 'library');
    appendStylesheetOnce(V131_ART_PACK_STYLESHEET, 'chronus-v131-layer', 'art-pack');
  }

  function setupCinematicHero() {
    const hero = document.querySelector('#view-home .hero-cinematic');
    const content = hero?.querySelector('.hero-content');
    if (!hero || !content) return;

    if (!hero.querySelector('.hero-v13-atmosphere')) {
      const atmosphere = document.createElement('div');
      atmosphere.className = 'hero-v13-atmosphere';
      atmosphere.setAttribute('aria-hidden', 'true');
      hero.prepend(atmosphere);
    }
    if (!content.querySelector('.hero-v13-context')) {
      const context = document.createElement('p');
      context.className = 'hero-v13-context';
      context.textContent = 'Berlim · 1992 · O véu está cedendo';
      content.prepend(context);
    }
    if (!hero.querySelector('.hero-v13-scroll')) {
      const scrollCue = document.createElement('span');
      scrollCue.className = 'hero-v13-scroll';
      scrollCue.setAttribute('aria-hidden', 'true');
      scrollCue.textContent = 'Desça para atravessar o véu';
      hero.appendChild(scrollCue);
    }
    preloadOptionalHeroArt(hero);
    requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-v13-ready')));
  }

  function preloadOptionalHeroArt(hero) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      hero.style.setProperty('--chronus-hero-art', `url("${HERO_ART}")`);
      hero.classList.add('is-art-ready');
    };
    image.onerror = () => hero.classList.remove('is-art-ready');
    image.src = HERO_ART;
  }

  function setupChronicleScene() {
    const home = document.getElementById('view-home');
    const hero = home?.querySelector('.hero-cinematic');
    const editorial = home?.querySelector('.editorial-section');
    if (!home || !hero || !editorial) return;

    if (!home.querySelector('.chronicle-scene-v13')) {
      const scene = document.createElement('section');
      scene.className = 'chronicle-scene-v13';
      scene.setAttribute('aria-labelledby', 'chronicle-scene-title');
      scene.innerHTML = `
        <div class="chronicle-scene-copy">
          <div class="chronicle-scene-index">01 · A história que vocês vivem</div>
          <div class="chronicle-scene-kicker">Capítulo de entrada</div>
          <h2 class="chronicle-scene-title" id="chronicle-scene-title">A Crônica</h2>
          <p class="chronicle-scene-lead">Depois da queda do Muro, Berlim não ficou apenas dividida por lembranças. Algo antigo se moveu nas sombras, e cada descoberta aproxima os personagens de uma realidade que sempre esteve ali.</p>
          <blockquote class="chronicle-scene-quote">“O Véu não caiu por acidente. Alguém abriu uma porta.”</blockquote>
          <div class="chronicle-scene-actions"><a class="chronicle-scene-link" href="#/chronicle" aria-label="Acessar a Crônica do CHRONUS"><span aria-hidden="true">✦</span> Acessar a Crônica <span aria-hidden="true">→</span></a></div>
          <div class="chronicle-scene-meta" aria-label="Elementos da Crônica">
            <div class="chronicle-scene-meta-item"><strong>História</strong><span>Capítulos e revelações</span></div>
            <div class="chronicle-scene-meta-item"><strong>Escolhas</strong><span>Decisões dos personagens</span></div>
            <div class="chronicle-scene-meta-item"><strong>Consequências</strong><span>O mundo reage à mesa</span></div>
          </div>
        </div>
        <div class="chronicle-scene-media" role="img" aria-label="Berlim noturna e chuvosa, cenário da Crônica CHRONUS em 1992"><div class="chronicle-scene-stamp" aria-hidden="true">Arquivo<br>Chronus</div><p class="chronicle-scene-caption">Berlim, 1992. Fotografias, mapas e fragmentos de uma cidade onde o sobrenatural se esconde à vista de todos.</p></div>`;
      hero.insertAdjacentElement('afterend', scene);
    }

    editorial.classList.add('editorial-section-v13-rest');
    const chronicleCard = editorial.querySelector('.editorial-cards-grid > .editorial-card:nth-child(1)');
    if (chronicleCard) {
      chronicleCard.hidden = true;
      chronicleCard.setAttribute('aria-hidden', 'true');
      chronicleCard.dataset.promotedToScene = 'chronicle';
    }
  }

  function setupSessionsScene() {
    const home = document.getElementById('view-home');
    const chronicleScene = home?.querySelector('.chronicle-scene-v13');
    const editorial = home?.querySelector('.editorial-section');
    if (!home || !chronicleScene || !editorial) return;

    if (!home.querySelector('.sessions-scene-v13')) {
      const scene = document.createElement('section');
      scene.className = 'sessions-scene-v13';
      scene.setAttribute('aria-labelledby', 'sessions-scene-title');
      scene.innerHTML = `
        <div class="sessions-scene-archive" aria-label="Arquivo visual das sessões da Crônica">
          <div class="sessions-dossier-grid">
            <div class="sessions-file-label">Dossiê ativo · registros recuperados</div>
            <div class="sessions-photo-stack" aria-hidden="true"><div class="sessions-photo" data-caption="Registro 01 — setor leste, após a chuva"></div><div class="sessions-photo" data-caption="Registro 02 — marca encontrada no concreto"></div></div>
            <aside class="sessions-notes" aria-label="Notas do arquivo de investigação"><strong>Notas de campo</strong><p>Horários não coincidem.</p><p>O mesmo símbolo aparece em locais diferentes.</p><p>Há páginas faltando no relatório.</p></aside>
            <div class="sessions-red-thread" aria-hidden="true"></div>
          </div>
        </div>
        <div class="sessions-scene-copy">
          <div class="sessions-scene-index">02 · O que realmente aconteceu</div><div class="sessions-scene-kicker">Diário de investigação</div><h2 class="sessions-scene-title" id="sessions-scene-title">Sessões</h2>
          <p class="sessions-scene-lead">Cada encontro deixa vestügios: datas, pistas, decisões, feridas e contradições. O diário reúne os fatos que a mesa testemunhou — e os detalhes que só fazem sentido quando vistos em sequência.</p>
          <div class="sessions-timeline" aria-label="Exemplo visual da cronologia das sessões">
            <div class="sessions-timeline-item"><time datetime="1992-05-07">07 · MAI · 1992</time><strong>Marcas na cidade</strong><span>Símbolos desconh