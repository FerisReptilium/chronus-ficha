/* CHRONUS v1.3 — Fase 3: microinterações e movimento progressivo */
(function() {
  const STYLE_HREF = 'css/cinematic-motion-v13.css';
  const SCENE_SELECTORS = [
    '.chronicle-scene-v13',
    '.sessions-scene-v13',
    '.npcs-scene-v13',
    '.locations-scene-v13',
    '.files-scene-v13',
    '.library-scene-v13'
  ];

  let started = false;
  let rafPending = false;

  function ensureStylesheet() {
    if (document.querySelector('link[data-chronus-v13-layer="motion"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.chronusV13Layer = 'motion';
    document.head.appendChild(link);
  }

  function allScenes(home) {
    return SCENE_SELECTORS.map(selector => home.querySelector(selector));
  }

  function scenesReady(home) {
    return allScenes(home).every(Boolean);
  }

  function markComplete(home) {
    if (scenesReady(home)) home.classList.add('is-v13-scenes-complete');
  }

  function setupReveal(home) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scenes = allScenes(home).filter(Boolean);

    scenes.forEach(scene => scene.classList.add('v13-motion-scene'));

    if (reduceMotion || !('IntersectionObserver' in window)) {
      scenes.forEach(scene => scene.classList.add('is-v13-revealed'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-v13-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      root: null,
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.12
    });

    home.classList.add('is-v13-motion-enabled');
    scenes.forEach(scene => observer.observe(scene));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateParallax(home) {
    rafPending = false;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const hero = home.querySelector('.hero-cinematic');
    const chronicleMedia = home.querySelector('.chronicle-scene-media');
    const vh = window.innerHeight || 1;

    if (hero) {
      const rect = hero.getBoundingClientRect();
      const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      const offset = (progress - 0.5) * 28;
      hero.style.setProperty('--v13-parallax-y', `${offset.toFixed(2)}px`);
    }

    if (chronicleMedia) {
      const rect = chronicleMedia.getBoundingClientRect();
      const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      const offset = (progress - 0.5) * 28;
      chronicleMedia.style.setProperty('--v13-parallax-y', `${offset.toFixed(2)}px`);
    }
  }

  function scheduleParallax(home) {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(() => updateParallax(home));
  }

  function setupParallax(home) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    window.addEventListener('scroll', () => scheduleParallax(home), { passive: true });
    window.addEventListener('resize', () => scheduleParallax(home), { passive: true });
    scheduleParallax(home);
  }

  function activate(home) {
    if (started || !scenesReady(home)) return false;
    started = true;
    ensureStylesheet();
    markComplete(home);
    setupReveal(home);
    setupParallax(home);
    return true;
  }

  function boot() {
    const home = document.getElementById('view-home');
    if (!home) return;
    if (activate(home)) return;

    const observer = new MutationObserver(() => {
      if (!activate(home)) return;
      observer.disconnect();
    });

    observer.observe(home, { childList: true, subtree: true });

    window.setTimeout(() => {
      observer.disconnect();
      if (!started) {
        ensureStylesheet();
        markComplete(home);
      }
    }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
