/**
 * CHRONUS v1.3.5 — loop cinematográfico progressivo da Home.
 *
 * O vídeo é decorativo, silencioso e opcional. O poster permanece como fallback
 * para celular, economia de dados, movimento reduzido e falhas de reprodução.
 */
window.ChronusHeroVideoV135 = (function() {
  const STYLE_HREF = 'css/hero-video-v135.css';
  const POSTER = 'assets/video/v135-hero-berlin-poster.webp';
  const SOURCES = [
    { src: 'assets/video/v135-hero-berlin-loop.webm', type: 'video/webm' },
    { src: 'assets/video/v135-hero-berlin-loop.mp4', type: 'video/mp4' }
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactViewport = window.matchMedia('(max-width: 760px)');
  let video = null;
  let visibilityObserver = null;
  let initialized = false;

  function ensureStylesheet() {
    if (document.querySelector('link[data-chronus-v135="hero-video"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.chronusV135 = 'hero-video';
    document.head.appendChild(link);
  }

  function heroArt() {
    return document.querySelector('#view-home .hero-v132-art');
  }

  function shouldAnimate() {
    return !reduceMotion.matches &&
      !compactViewport.matches &&
      navigator.connection?.saveData !== true;
  }

  function attemptPlay() {
    if (!video || document.hidden || !shouldAnimate()) return;
    const playback = video.play();
    playback?.catch?.(() => {
      heroArt()?.classList.add('is-v135-video-blocked');
    });
  }

  function removeVideo() {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
      video.load();
      video.remove();
      video = null;
    }
    heroArt()?.classList.remove('is-v135-video-ready', 'is-v135-video-playing', 'is-v135-video-blocked');
  }

  function createVideo() {
    const art = heroArt();
    if (!art || video || !shouldAnimate()) return;

    video = document.createElement('video');
    video.className = 'hero-v135-video';
    video.poster = POSTER;
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.disablePictureInPicture = true;
    video.tabIndex = -1;
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('role', 'presentation');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    SOURCES.forEach(({ src, type }) => {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.appendChild(source);
    });

    video.addEventListener('loadeddata', () => art.classList.add('is-v135-video-ready'), { once: true });
    video.addEventListener('playing', () => {
      art.classList.add('is-v135-video-ready', 'is-v135-video-playing');
      art.classList.remove('is-v135-video-blocked');
    });
    video.addEventListener('pause', () => art.classList.remove('is-v135-video-playing'));
    video.addEventListener('error', () => {
      art.classList.add('is-v135-video-fallback');
      removeVideo();
    }, { once: true });

    art.prepend(video);

    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(entries => {
        const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0.08);
        if (visible) attemptPlay();
        else video?.pause();
      }, { threshold: [0, 0.08, 0.25] });
      visibilityObserver.observe(art);
    } else {
      attemptPlay();
    }
  }

  function reconcilePlayback() {
    if (shouldAnimate()) createVideo();
    else removeVideo();
  }

  function listenTo(query, listener) {
    if (query.addEventListener) query.addEventListener('change', listener);
    else query.addListener(listener);
  }

  function init() {
    if (initialized) return true;
    const art = heroArt();
    if (!art) return false;

    initialized = true;
    ensureStylesheet();
    art.classList.add('hero-v135');
    art.dataset.poster = POSTER;
    listenTo(reduceMotion, reconcilePlayback);
    listenTo(compactViewport, reconcilePlayback);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) video?.pause();
      else attemptPlay();
    });
    reconcilePlayback();
    document.documentElement.dataset.chronusHeroVideo = 'v1.3.5-preview';
    return true;
  }

  return { init };
})();
