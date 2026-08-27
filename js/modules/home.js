/**
 * CHRONUS — Home Page Module
 * Renderização e interatividade da página inicial cinematográfica.
 */
window.ChronusHome = (function() {
  const V13_STYLESHEET = 'css/cinematic-v13.css';
  const HERO_ART = 'assets/art/hero-berlin-1992.webp';

  function init() {
    setupV13Styles();
    setupCinematicHero();
    setupHeroCta();
  }

  function setupV13Styles() {
    if (document.querySelector(`link[data-chronus-v13="cinematic"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = V13_STYLESHEET;
    link.dataset.chronusV13 = 'cinematic';
    document.head.appendChild(link);
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

    // A Fase 1 não depende de asset externo: se a arte original ainda não
    // estiver no repositório, o CSS mantém um fallback cinematográfico completo.
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
