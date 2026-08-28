/**
 * CHRONUS v1.3.4 — Trilha ambiente global.
 * Reproduz o vídeo oficial informado pelo projeto através da API incorporada do YouTube.
 * Nenhum arquivo de áudio é baixado, copiado ou hospedado pelo portal.
 */
window.ChronusAmbientAudio = (function() {
  'use strict';

  const VIDEO_ID = 'hytkruP8wJk';
  const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
  const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
  const STORAGE_KEY = 'chronus.ambientAudio.enabled.v1';
  const DEFAULT_VOLUME = 28;

  let initialized = false;
  let player = null;
  let playerReady = false;
  let enabled = true;
  let uiState = 'loading';
  let playbackProbe = 0;
  let gestureListenersArmed = false;

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch (error) {
      return true;
    }
  }

  function savePreference(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch (error) {}
  }

  function ensureStylesheet() {
    const href = 'css/ambient-audio-v134.css';
    if (document.querySelector(`link[data-chronus-audio-style="${href}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.chronusAudioStyle = href;
    document.head.appendChild(link);
  }

  function buildDock() {
    const existing = document.getElementById('chronus-audio-dock');
    if (existing) return existing;

    const dock = document.createElement('aside');
    dock.id = 'chronus-audio-dock';
    dock.className = 'chronus-audio-dock no-print';
    dock.dataset.state = 'loading';
    dock.setAttribute('aria-label', 'Controle da trilha ambiente');

    const toggle = document.createElement('button');
    toggle.id = 'chronus-audio-toggle';
    toggle.className = 'chronus-audio-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-describedby', 'chronus-audio-status');

    const bars = document.createElement('span');
    bars.className = 'chronus-audio-bars';
    bars.setAttribute('aria-hidden', 'true');
    bars.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));

    const copy = document.createElement('span');
    copy.className = 'chronus-audio-copy';

    const eyebrow = document.createElement('small');
    eyebrow.textContent = 'Trilha ambiente';

    const title = document.createElement('strong');
    title.textContent = 'Goodbye · Dark';

    const status = document.createElement('span');
    status.id = 'chronus-audio-status';
    status.className = 'chronus-audio-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Preparando';

    copy.append(eyebrow, title);
    toggle.append(bars, copy, status);

    const source = document.createElement('a');
    source.className = 'chronus-audio-source';
    source.href = VIDEO_URL;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = '↗';
    source.setAttribute('aria-label', 'Abrir Goodbye no YouTube');
    source.title = 'Abrir faixa no YouTube';

    const playerFrame = document.createElement('div');
    playerFrame.className = 'chronus-audio-player-frame';
    playerFrame.setAttribute('aria-hidden', 'true');

    const playerHost = document.createElement('div');
    playerHost.id = 'chronus-ambient-youtube';
    playerFrame.appendChild(playerHost);

    toggle.addEventListener('click', handleToggle);
    dock.append(toggle, source, playerFrame);
    document.body.appendChild(dock);
    return dock;
  }

  function setUiState(nextState) {
    uiState = nextState;
    const dock = document.getElementById('chronus-audio-dock');
    const toggle = document.getElementById('chronus-audio-toggle');
    const status = document.getElementById('chronus-audio-status');
    if (!dock || !toggle || !status) return;

    const labels = {
      loading: ['Preparando', 'Preparando trilha ambiente'],
      on: ['Tocando', 'Desligar trilha ambiente'],
      awaiting: ['Clique para ouvir', 'Ligar trilha ambiente'],
      off: ['Desligada', 'Ligar trilha ambiente'],
      unavailable: ['Indisponível', 'Trilha indisponível']
    };
    const [statusText, buttonLabel] = labels[nextState] || labels.loading;

    dock.dataset.state = nextState;
    status.textContent = statusText;
    toggle.setAttribute('aria-label', buttonLabel);
    toggle.setAttribute('aria-pressed', String(nextState === 'on'));
    toggle.disabled = nextState === 'unavailable';
  }

  function disarmGestureFallback() {
    if (!gestureListenersArmed) return;
    document.removeEventListener('pointerdown', handleFirstGesture, true);
    document.removeEventListener('keydown', handleFirstGesture, true);
    gestureListenersArmed = false;
  }

  function armGestureFallback() {
    if (gestureListenersArmed || !enabled || uiState === 'on') return;
    document.addEventListener('pointerdown', handleFirstGesture, true);
    document.addEventListener('keydown', handleFirstGesture, true);
    gestureListenersArmed = true;
  }

  function handleFirstGesture(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#chronus-audio-toggle, .chronus-audio-source')) return;
    if (!enabled || !playerReady || uiState === 'on') return;
    attemptAudiblePlayback(true);
  }

  function attemptAudiblePlayback(fromGesture) {
    if (!enabled) {
      setUiState('off');
      return;
    }
    if (!playerReady || !player) {
      setUiState('loading');
      armGestureFallback();
      return;
    }

    window.clearTimeout(playbackProbe);
    try {
      player.setVolume(DEFAULT_VOLUME);
      player.unMute();
      player.playVideo();
      setUiState(fromGesture ? 'on' : 'loading');
    } catch (error) {
      setUiState('awaiting');
      armGestureFallback();
      return;
    }

    playbackProbe = window.setTimeout(() => {
      if (!enabled || !playerReady || !player) return;
      const isPlaying = player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
      const isMuted = player.isMuted?.() === true;

      if (isPlaying && !isMuted) {
        setUiState('on');
        disarmGestureFallback();
        return;
      }

      // Autoplay com som foi bloqueado: mantém o vídeo preparado em silêncio
      // e libera o áudio no primeiro clique ou toque do visitante.
      try {
        player.mute();
        player.playVideo();
      } catch (error) {}
      setUiState('awaiting');
      armGestureFallback();
    }, 1100);
  }

  function disablePlayback() {
    enabled = false;
    savePreference(false);
    window.clearTimeout(playbackProbe);
    try { player?.pauseVideo?.(); } catch (error) {}
    setUiState('off');
    disarmGestureFallback();
  }

  function enablePlayback() {
    enabled = true;
    savePreference(true);
    attemptAudiblePlayback(true);
  }

  function handleToggle() {
    if (uiState === 'on' || (uiState === 'loading' && enabled)) {
      disablePlayback();
    } else {
      enablePlayback();
    }
  }

  function handlePlayerReady(event) {
    player = event.target;
    playerReady = true;
    if (enabled) attemptAudiblePlayback(false);
    else setUiState('off');
  }

  function handlePlayerStateChange(event) {
    if (!enabled) {
      setUiState('off');
      return;
    }

    if (event.data === window.YT?.PlayerState?.PLAYING) {
      const muted = player?.isMuted?.() === true;
      setUiState(muted ? 'awaiting' : 'on');
      if (!muted) disarmGestureFallback();
    } else if (event.data === window.YT?.PlayerState?.ENDED) {
      attemptAudiblePlayback(false);
    }
  }

  function handlePlayerError() {
    playerReady = false;
    setUiState('unavailable');
    disarmGestureFallback();
  }

  function createPlayer() {
    if (player || !window.YT?.Player || !document.getElementById('chronus-ambient-youtube')) return;
    try {
      player = new window.YT.Player('chronus-ambient-youtube', {
        width: '200',
        height: '113',
        videoId: VIDEO_ID,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          loop: 1,
          modestbranding: 1,
          origin: window.location.origin,
          playlist: VIDEO_ID,
          playsinline: 1,
          rel: 0
        },
        events: {
          onReady: handlePlayerReady,
          onStateChange: handlePlayerStateChange,
          onError: handlePlayerError
        }
      });
    } catch (error) {
      handlePlayerError();
    }
  }

  function loadYoutubeApi() {
    if (window.YT?.Player) {
      createPlayer();
      return;
    }

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
      if (typeof previousReady === 'function') previousReady();
      createPlayer();
    };

    const existing = document.querySelector(`script[src="${IFRAME_API_URL}"]`);
    if (existing) {
      existing.addEventListener('error', handlePlayerError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = IFRAME_API_URL;
    script.async = true;
    script.dataset.chronusAudioApi = 'youtube';
    script.addEventListener('error', handlePlayerError, { once: true });
    document.head.appendChild(script);
  }

  function init() {
    if (initialized) return true;
    initialized = true;
    enabled = readPreference();
    ensureStylesheet();
    buildDock();
    setUiState(enabled ? 'loading' : 'off');
    if (enabled) armGestureFallback();
    loadYoutubeApi();
    document.documentElement.dataset.chronusAudio = 'v1.3.4-preview';
    return true;
  }

  return {
    init,
    getState: () => ({ enabled, ready: playerReady, state: uiState, videoId: VIDEO_ID })
  };
})();
