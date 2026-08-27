/**
 * CHRONUS — Home Page Module
 * Renderização e interatividade da página inicial cinematográfica.
 */
window.ChronusHome = (function() {
  const V13_STYLESHEET = 'css/cinematic-v13.css';
  const V13_SCENES_STYLESHEET = 'css/cinematic-scenes-v13.css';
  const HERO_ART = 'assets/art/hero-berlin-1992.webp';

  function init() {
    setupV13Styles();
    setupCinematicHero();
    setupChronicleScene();
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

    requestAnimationFrame(() => {
      requestAnimationFrame(() => hero.classList.add('is-v13-ready'));
    });
  }

  function preloadOptionalHeroArt(hero) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      hero.style.setProperty('--chronus-hero-art', `url("${HERO_ART}")`);
      hero.classList.add('is-art-ready');
    };
    image.onerror = () => {
      hero.classList.remove('is-art-ready');
    };
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
          <p class="chronicle-scene-lead">
            Depois da queda do Muro, Berlim não ficou apenas dividida por lembranças. Algo antigo se moveu nas sombras, e cada descoberta aproxima os personagens de uma realidade que sempre esteve ali.
          </p>
          <blockquote class="chronicle-scene-quote">
            “O Véu não caiu por acidente. Alguém abriu uma porta.”
          </blockquote>
          <div class="chronicle-scene-actions">
            <a class="chronicle-scene-link" href="#/chronicle" aria-label="Acessar a Crônica do CHRONUS">
              <span aria-hidden="true">✦</span> Acessar a Crônica <span aria-hidden="true">→</span>
            </a>
          </div>
          <div class="chronicle-scene-meta" aria-label="Elementos da Crônica">
            <div class="chronicle-scene-meta-item"><strong>História</strong><span>Capítulos e revelações</span></div>
            <div class="chronicle-scene-meta-item"><strong>Escolhas</strong><span>Decisões dos personagens</span></div>
            <div class="chronicle-scene-meta-item"><strong>Consequências</strong><span>O mundo reage à mesa</span></div>
          </div>
        </div>
        <div class="chronicle-scene-media" role="img" aria-label="Berlim noturna e chuvosa, cenário da Crônica CHRONUS em 1992">
          <div class="chronicle-scene-stamp" aria-hidden="true">Arquivo<br>Chronus</div>
          <p class="chronicle-scene-caption">Berlim, 1992. Fotografias, mapas e fragmentos de uma cidade onde o sobrenatural se esconde à vista de todos.</p>
        </div>`;
      hero.insertAdjacentElement('afterend', scene);
    }

    editorial.classList.add('editorial-section-v13-rest');

    const chronicleCard = editorial.querySelector('.editorial-cards-grid > .editorial-card');
    if (chronicleCard) {
      chronicleCard.hidden = true;
      chronicleCard.setAttribute('aria-hidden', 'true');
      chronicleCard.dataset.promotedToScene = 'chronicle';
    }
  }

  function setupHeroCta() {
    document.getElementById('hero-btn-chronicle')?.addEventListener('click', () => {
      window.ChronusRouter.navigateTo('#/chronicle');
    });

    document.getElementById('hero-btn-universe')?.addEventListener('click', () => {
      window.ChronusRouter.navigateTo('#/system');
    });

    document.getElementById('hero-btn-player-area')?.addEventListener('click', () => {
      const user = window.ChronusAuth?.getUser();
      const profile = window.ChronusAuth?.getProfile();
      if (!user) {
        window.ChronusAuth?.showAuthModal();
      } else if (profile?.role === 'narrator') {
        window.ChronusRouter.navigateTo('#/narrator');
      } else {
        window.ChronusRouter.navigateTo('#/player');
      }
    });
  }

  return {
    init
  };
})();
