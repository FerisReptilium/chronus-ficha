/**
 * CHRONUS LIVE v1.4.0 — protótipo visual seguro da sala de sessão.
 *
 * Esta fase não acessa getUserMedia, não transmite mídia e não contém chaves
 * externas. O módulo valida layout, estados, acessibilidade e integração com os
 * dados já existentes do jogador antes da escolha definitiva do transporte WebRTC.
 */
window.ChronusLiveV140 = (function() {
  'use strict';

  const STYLE_HREF = 'css/chronus-live-v140.css';
  const PREVIEW_MARKER = 'v1.4.0-prototype';
  const DEFAULT_PARTICIPANTS = Object.freeze([
    Object.freeze({
      id: 'narrator',
      playerName: 'Narrador',
      characterName: 'Operador da K-17',
      role: 'Narrador',
      detail: 'Controle da crônica',
      portrait: null,
      cameraArt: null,
      camera: true,
      microphone: true,
      speaking: false
    }),
    Object.freeze({
      id: 'local',
      playerName: 'Jogador local',
      characterName: 'Desperto 01',
      role: 'Jogador',
      detail: 'Tradição não definida',
      portrait: null,
      cameraArt: null,
      camera: false,
      microphone: true,
      speaking: true,
      isLocal: true
    }),
    Object.freeze({
      id: 'player-02',
      playerName: 'Jogador 02',
      characterName: 'Desperto 02',
      role: 'Jogador',
      detail: 'Contato de campo',
      portrait: null,
      cameraArt: null,
      camera: true,
      microphone: true,
      speaking: false
    }),
    Object.freeze({
      id: 'player-03',
      playerName: 'Jogador 03',
      characterName: 'Desperto 03',
      role: 'Jogador',
      detail: 'Especialista em arquivos',
      portrait: null,
      cameraArt: null,
      camera: false,
      microphone: false,
      speaking: false
    }),
    Object.freeze({
      id: 'player-04',
      playerName: 'Jogador 04',
      characterName: 'Desperto 04',
      role: 'Jogador',
      detail: 'Observador do Véu',
      portrait: null,
      cameraArt: null,
      camera: false,
      microphone: true,
      speaking: false
    })
  ]);

  let initialized = false;
  let rendered = false;
  let portraitObjectUrl = '';
  let portraitHydrationId = 0;
  let presenceChannel = null;
  let presenceKey = '';
  let presenceGeneration = 0;
  let presenceStatus = 'Desconectado';
  let currentIdentity = null;
  let activeSessionId = '';
  let state = createInitialState();

  function createInitialState() {
    return {
      participants: isLocalPreview() ? DEFAULT_PARTICIPANTS.map(participant => ({ ...participant })) : [],
      spotlightId: isLocalPreview() ? 'narrator' : '',
      layout: 'focus',
      screenShare: false
    };
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-chronus-live="v140"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.chronusLive = 'v140';
    document.head.appendChild(link);
  }

  function isLocalPreview() {
    const location = window.location;
    if (!location) return false;
    const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    const hash = location.hash || '';
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    return localHost && new URLSearchParams(query).get('preview') === '1';
  }

  function getRoot() {
    return document.getElementById('chronus-live-root');
  }

  function getActiveSessionId() {
    const hash = window.location.hash || '';
    if (hash.startsWith('#/live')) {
      const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const value = new URLSearchParams(query).get('session') || '';
      activeSessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : '';
    }
    return activeSessionId;
  }

  function participantById(id) {
    return state.participants.find(participant => participant.id === id) || state.participants[0];
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function createIcon(name) {
    const icons = {
      camera: '▣',
      cameraOff: '▧',
      microphone: '●',
      microphoneOff: '○',
      share: '▤',
      grid: '▦',
      focus: '◉',
      leave: '×',
      dice: '◆'
    };
    const icon = createElement('span', 'chronus-live-control-icon', icons[name] || '✦');
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function mediaDescriptor(participant) {
    const source = participant.camera ? participant.cameraArt : participant.portrait;
    const hasSource = typeof source === 'string' && source.trim().length > 0;
    return Object.freeze({
      source: hasSource ? source : null,
      hasSource,
      hasPortrait: Boolean(participant.portrait),
      state: participant.camera ? 'camera' : (hasSource ? 'portrait' : 'empty')
    });
  }

  function buildShell() {
    const root = getRoot();
    if (!root) return false;

    root.innerHTML = `
      <header class="chronus-live-hero">
        <div class="chronus-live-hero-copy">
          <div class="chronus-live-eyebrow"><span aria-hidden="true"></span> Sonderstelle K-17 · canal protegido</div>
          <h1 id="chronus-live-title">CHRONUS <em>LIVE</em></h1>
          <p>Mesa virtual cinematográfica para narrativa, investigação e decisões em tempo real.</p>
        </div>
        <div class="chronus-live-prototype-badge" role="status">
          <span aria-hidden="true"></span>
          <div><strong>Protótipo visual</strong><small>Sem câmera ou áudio reais</small></div>
        </div>
      </header>

      <div class="chronus-live-room" aria-label="Sala CHRONUS LIVE">
        <main class="chronus-live-stage-column">
          <div class="chronus-live-room-bar">
            <div>
              <span class="chronus-live-room-code">CHRONUS LIVE / SESSÃO</span>
              <strong id="chronus-live-session-heading">Selecione uma sessão</strong>
            </div>
            <label class="chronus-live-session-picker" for="chronus-live-session-select">
              <span>Sessão ativa</span>
              <select id="chronus-live-session-select" aria-label="Selecionar sessão da mesa">
                <option value="">Carregando sessões…</option>
              </select>
            </label>
            <div class="chronus-live-room-state" id="chronus-live-participant-count"><span aria-hidden="true"></span> Aguardando participantes</div>
            <div class="chronus-live-connection-status" id="chronus-live-connection-status" role="status" aria-live="polite">
              <strong>Conectando à mesa</strong>
              <small>Validando sua sessão</small>
            </div>
          </div>

          <section id="chronus-live-session-admin" class="chronus-live-session-admin" hidden aria-labelledby="chronus-live-session-admin-title">
            <div class="chronus-live-session-admin-heading">
              <strong id="chronus-live-session-admin-title">Acesso à sessão</strong>
              <small>Somente o Narrador pode gerenciar os participantes</small>
            </div>
            <div class="chronus-live-session-admin-add">
              <label for="chronus-live-member-player">Adicionar jogador</label>
              <select id="chronus-live-member-player">
                <option value="">Carregando jogadores…</option>
              </select>
              <button type="button" id="chronus-live-member-add">Adicionar</button>
            </div>
            <ul id="chronus-live-session-members" aria-label="Jogadores autorizados"></ul>
            <p id="chronus-live-session-admin-status" role="status" aria-live="polite"></p>
          </section>

          <section id="chronus-live-stage" class="chronus-live-stage" aria-label="Participante em destaque"></section>

          <div class="chronus-live-layout-bar" aria-label="Modos de visualização">
            <span>Participantes</span>
            <div>
              <button type="button" class="chronus-live-layout-btn is-active" id="chronus-live-focus" aria-pressed="true"><span aria-hidden="true">◉</span> Foco</button>
              <button type="button" class="chronus-live-layout-btn" id="chronus-live-grid" aria-pressed="false"><span aria-hidden="true">▦</span> Grade</button>
            </div>
          </div>

          <div id="chronus-live-roster" class="chronus-live-roster" aria-label="Participantes da sessão"></div>

          <nav class="chronus-live-controls" aria-label="Controles da sala ao vivo">
            <button type="button" class="chronus-live-control" id="chronus-live-microphone" aria-pressed="false"></button>
            <button type="button" class="chronus-live-control" id="chronus-live-camera" aria-pressed="true"></button>
            <button type="button" class="chronus-live-control" id="chronus-live-share" aria-pressed="false"></button>
            <button type="button" class="chronus-live-control" id="chronus-live-dice"></button>
            <button type="button" class="chronus-live-control is-danger" id="chronus-live-leave"></button>
          </nav>
        </main>

        <aside class="chronus-live-sidebar" aria-label="Painel da sessão">
          <div class="chronus-live-sidebar-head">
            <span>Registro operacional</span>
            <strong>CASO K-17/001</strong>
          </div>

          <section class="chronus-live-objective" aria-labelledby="chronus-live-objective-title">
            <span>Objetivo atual</span>
            <h2 id="chronus-live-objective-title">Rastrear a origem da transmissão</h2>
            <p>O sinal repete coordenadas de Teufelsberg e uma frequência ausente dos registros oficiais.</p>
            <div><span>Risco elevado</span><span>Berlim · 1990</span></div>
          </section>

          <section id="chronus-live-feed" class="chronus-live-feed" aria-labelledby="chronus-live-feed-title">
            <div class="chronus-live-section-title"><h2 id="chronus-live-feed-title">Pulso da sessão</h2><span>Agora</span></div>
            <ol id="chronus-live-feed-list" aria-live="polite"></ol>
          </section>

          <section class="chronus-live-quick" aria-labelledby="chronus-live-quick-title">
            <h2 id="chronus-live-quick-title">Acesso rápido</h2>
            <div>
              <a href="#/sheet"><span aria-hidden="true">⌁</span><strong>Minha ficha</strong><small>Recursos e condições</small></a>
              <a href="#/files"><span aria-hidden="true">▤</span><strong>Evidências</strong><small>Arquivos autorizados</small></a>
              <a href="#/maps"><span aria-hidden="true">⌖</span><strong>Atlas</strong><small>Locais registrados</small></a>
            </div>
          </section>
        </aside>
      </div>

      <p class="chronus-live-disclaimer">Presença e rolagens são sincronizadas pela sessão autenticada. Áudio, vídeo e compartilhamento de tela ainda não estão disponíveis.</p>
      <div id="chronus-live-announcement" class="sr-only" role="status" aria-live="polite"></div>
    `;

    rendered = true;
    bindControls();
    renderAll();
    return true;
  }

  function appendMedia(container, participant, compact = false) {
    const descriptor = mediaDescriptor(participant);
    const media = createElement('div', `chronus-live-media ${participant.camera ? 'is-camera-on' : 'is-camera-off'}${descriptor.hasSource ? '' : ' is-media-empty'}`);
    media.dataset.mediaState = descriptor.state;
    media.dataset.hasPortrait = String(descriptor.hasPortrait);

    if (descriptor.hasSource) {
      const backdrop = document.createElement('img');
      backdrop.className = 'chronus-live-media-backdrop';
      backdrop.src = descriptor.source;
      backdrop.alt = '';
      backdrop.setAttribute('aria-hidden', 'true');
      media.appendChild(backdrop);
    } else {
      media.appendChild(createElement('span', 'sr-only', `${participant.characterName} ainda não possui foto cadastrada na ficha.`));
    }

    if (participant.camera) {
      const liveTag = createElement('span', 'chronus-live-camera-tag', 'CÂMERA · SIMULAÇÃO');
      media.appendChild(liveTag);
    } else if (descriptor.hasSource) {
      const portraitFrame = createElement('div', compact ? 'chronus-live-portrait is-compact' : 'chronus-live-portrait');
      const portrait = document.createElement('img');
      portrait.src = participant.portrait;
      portrait.alt = `Retrato de ${participant.characterName}`;
      portraitFrame.appendChild(portrait);
      media.appendChild(portraitFrame);

      const offTag = createElement('span', 'chronus-live-camera-off-tag', 'Câmera desligada');
      media.appendChild(offTag);
    }

    container.appendChild(media);
  }

  function appendIdentity(container, participant, compact = false) {
    const identity = createElement('div', compact ? 'chronus-live-identity is-compact' : 'chronus-live-identity');
    const copy = createElement('div');
    const characterName = createElement('strong', '', participant.characterName);
    const playerName = createElement('span', '', `${participant.playerName} · ${participant.detail}`);
    copy.append(characterName, playerName);

    const stateIcons = createElement('div', 'chronus-live-state-icons');
    const mic = createElement('span', participant.microphone ? 'is-on' : 'is-off', participant.microphone ? '●' : '○');
    mic.title = participant.microphone ? 'Microfone ligado' : 'Microfone desligado';
    mic.setAttribute('aria-label', mic.title);
    const cam = createElement('span', participant.camera ? 'is-on' : 'is-off', participant.camera ? '▣' : '▧');
    cam.title = participant.camera ? 'Câmera ligada' : 'Câmera desligada';
    cam.setAttribute('aria-label', cam.title);
    stateIcons.append(mic, cam);
    identity.append(copy, stateIcons);
    container.appendChild(identity);
  }

  function renderStage() {
    const stage = document.getElementById('chronus-live-stage');
    if (!stage) return;
    stage.innerHTML = '';
    stage.classList.toggle('is-screen-share', state.screenShare);

    if (state.screenShare) {
      const share = createElement('div', 'chronus-live-shared-file');
      const image = document.createElement('img');
      image.src = 'assets/art/v132-documents.webp';
      image.alt = 'Mesa de investigação com documentos e fotografias de Berlim';
      const overlay = createElement('div', 'chronus-live-shared-file-copy');
      overlay.append(
        createElement('span', '', 'DOCUMENTO COMPARTILHADO'),
        createElement('strong', '', 'Transcrição interceptada · Teufelsberg'),
        createElement('p', '', 'O compartilhamento de tela real será conectado somente após a aprovação desta interface.')
      );
      share.append(image, overlay);
      stage.appendChild(share);
      return;
    }

    const participant = participantById(state.spotlightId);
    if (!participant) {
      stage.classList.remove('is-speaking');
      stage.appendChild(createElement('div', 'chronus-live-empty-stage', 'Entre com sua conta para aparecer na mesa.'));
      return;
    }
    stage.classList.toggle('is-speaking', false);
    const mediaWrap = createElement('div', 'chronus-live-stage-media');
    appendMedia(mediaWrap, participant, false);

    const status = createElement('div', 'chronus-live-stage-status');
    status.append(
      createElement('span', '', participant.role === 'Narrador' ? 'CANAL DO NARRADOR' : 'DESPERTO EM DESTAQUE'),
      createElement('small', '', participant.speaking && participant.microphone ? 'Falando agora' : 'Conectado')
    );
    mediaWrap.appendChild(status);
    appendIdentity(mediaWrap, participant, false);
    stage.appendChild(mediaWrap);
  }

  function renderRoster() {
    const roster = document.getElementById('chronus-live-roster');
    if (!roster) return;
    roster.innerHTML = '';
    roster.classList.toggle('is-grid', state.layout === 'grid');
    if (!state.participants.length) {
      roster.appendChild(createElement('p', 'chronus-live-empty-roster', 'Nenhum participante conectado. Entre com sua conta para aparecer nesta mesa.'));
      return;
    }

    state.participants.forEach(participant => {
      const card = createElement('button', 'chronus-live-participant');
      card.type = 'button';
      card.dataset.participantId = participant.id;
      card.classList.toggle('is-selected', participant.id === state.spotlightId && !state.screenShare);
      card.classList.toggle('is-speaking', false);
      card.setAttribute('aria-pressed', String(participant.id === state.spotlightId && !state.screenShare));
      card.setAttribute('aria-label', `Destacar ${participant.characterName}`);

      appendMedia(card, participant, true);
      appendIdentity(card, participant, true);
      card.addEventListener('click', () => {
        state.spotlightId = participant.id;
        state.screenShare = false;
        updateShareControl();
        renderStage();
        renderRoster();
        announce(`${participant.characterName} está em destaque.`);
      });
      roster.appendChild(card);
    });
  }

  function renderAll() {
    renderStage();
    renderRoster();
    updateLocalControls();
    updateLayoutControls();
    updateParticipantCount();
  }

  function seedFeed() {
    const list = document.getElementById('chronus-live-feed-list');
    if (!list || list.children.length) return;
    appendFeed('Sistema', 'Sala protegida preparada para a sessão.', 'agora');
    appendFeed('Narrador', 'Objetivo da cena atualizado.', 'há 1 min');
    appendFeed('Desperto 02', 'Solicitação de teste recebida · Percepção.', 'há 2 min');
  }

  function appendFeed(actor, message, time) {
    const list = document.getElementById('chronus-live-feed-list');
    if (!list) return;
    const item = createElement('li');
    const marker = createElement('span', 'chronus-live-feed-marker');
    marker.setAttribute('aria-hidden', 'true');
    const copy = createElement('div');
    copy.append(createElement('strong', '', actor), createElement('p', '', message));
    const timestamp = createElement('time', '', time);
    item.append(marker, copy, timestamp);
    list.prepend(item);
  }

  function setControlContent(button, iconName, label, detail) {
    if (!button) return;
    button.innerHTML = '';
    button.append(createIcon(iconName), createElement('span', '', label));
    button.title = detail || label;
    button.setAttribute('aria-label', detail || label);
  }

  function updateLocalControls() {
    const local = state.participants.find(item => item.isLocal);
    const microphone = document.getElementById('chronus-live-microphone');
    const camera = document.getElementById('chronus-live-camera');
    if (isLocalPreview() && local) {
      if (microphone) {
        microphone.disabled = false;
        microphone.setAttribute('aria-pressed', String(!local.microphone));
        microphone.classList.toggle('is-off', !local.microphone);
        setControlContent(microphone, local.microphone ? 'microphone' : 'microphoneOff', local.microphone ? 'Microfone' : 'Sem áudio', local.microphone ? 'Desligar microfone simulado' : 'Ligar microfone simulado');
      }
      if (camera) {
        const cameraLabel = local.camera ? 'Câmera' : (local.portrait ? 'Retrato' : 'Sem foto');
        camera.disabled = false;
        camera.setAttribute('aria-pressed', String(!local.camera));
        camera.classList.toggle('is-off', !local.camera);
        setControlContent(camera, local.camera ? 'camera' : 'cameraOff', cameraLabel, local.camera ? 'Desligar câmera simulada' : 'Ligar câmera simulada');
      }
      return;
    }
    if (microphone) {
      microphone.disabled = true;
      microphone.setAttribute('aria-pressed', 'false');
      microphone.classList.add('is-off');
      setControlContent(microphone, 'microphoneOff', 'Áudio', 'Áudio ainda não disponível');
    }
    if (camera) {
      camera.disabled = true;
      camera.setAttribute('aria-pressed', 'false');
      camera.classList.add('is-off');
      setControlContent(camera, 'cameraOff', 'Câmera', 'Vídeo ainda não disponível');
    }
  }

  function updateLayoutControls() {
    const focus = document.getElementById('chronus-live-focus');
    const grid = document.getElementById('chronus-live-grid');
    if (focus) {
      focus.classList.toggle('is-active', state.layout === 'focus');
      focus.setAttribute('aria-pressed', String(state.layout === 'focus'));
    }
    if (grid) {
      grid.classList.toggle('is-active', state.layout === 'grid');
      grid.setAttribute('aria-pressed', String(state.layout === 'grid'));
    }
  }

  function updateShareControl() {
    const share = document.getElementById('chronus-live-share');
    if (!share) return;
    if (isLocalPreview()) {
      share.disabled = false;
      share.setAttribute('aria-pressed', String(state.screenShare));
      share.classList.toggle('is-active', state.screenShare);
      setControlContent(share, 'share', state.screenShare ? 'Encerrar tela' : 'Compartilhar', state.screenShare ? 'Encerrar compartilhamento simulado' : 'Simular compartilhamento de tela');
      return;
    }
    share.disabled = true;
    share.setAttribute('aria-pressed', 'false');
    share.classList.remove('is-active');
    setControlContent(share, 'share', 'Compartilhar', 'Compartilhamento de tela ainda não disponível');
  }

  function announce(message) {
    const live = document.getElementById('chronus-live-announcement');
    if (live) live.textContent = message;
  }

  function bindControls() {
    const microphone = document.getElementById('chronus-live-microphone');
    const camera = document.getElementById('chronus-live-camera');
    const share = document.getElementById('chronus-live-share');
    const dice = document.getElementById('chronus-live-dice');
    const leave = document.getElementById('chronus-live-leave');
    const focus = document.getElementById('chronus-live-focus');
    const grid = document.getElementById('chronus-live-grid');

    setControlContent(share, 'share', 'Compartilhar', 'Compartilhamento de tela ainda não disponível');
    share.disabled = true;
    if (isLocalPreview()) {
      microphone?.addEventListener('click', () => {
        const local = participantById('local');
        local.microphone = !local.microphone;
        local.speaking = local.microphone;
        renderAll();
        appendFeed(local.characterName, local.microphone ? 'Microfone simulado ligado.' : 'Microfone simulado desligado.', 'agora');
        announce(local.microphone ? 'Microfone simulado ligado.' : 'Microfone simulado desligado.');
      });
      camera?.addEventListener('click', () => {
        const local = participantById('local');
        local.camera = !local.camera;
        state.spotlightId = local.id;
        state.screenShare = false;
        updateShareControl();
        renderAll();
        announce(local.camera ? 'Câmera simulada ligada.' : 'Câmera desligada; retrato ou quadro vazio exibido.');
      });
      share?.addEventListener('click', () => {
        state.screenShare = !state.screenShare;
        updateShareControl();
        renderStage();
        renderRoster();
        announce(state.screenShare ? 'Compartilhamento simulado iniciado.' : 'Compartilhamento simulado encerrado.');
      });
    }
    setControlContent(dice, 'dice', 'Rolar dados', 'Abrir o rolador CHRONUS');
    setControlContent(leave, 'leave', 'Sair', 'Sair da sala de demonstração');

    dice?.addEventListener('click', () => {
      const launcher = document.getElementById('chronus-dice-launcher');
      if (launcher) launcher.click();
      else announce('O rolador ainda está sendo preparado.');
    });

    leave?.addEventListener('click', () => {
      window.location.hash = '#/home';
    });

    focus?.addEventListener('click', () => {
      state.layout = 'focus';
      renderRoster();
      updateLayoutControls();
      announce('Visualização em foco selecionada.');
    });

    grid?.addEventListener('click', () => {
      state.layout = 'grid';
      renderRoster();
      updateLayoutControls();
      announce('Visualização em grade selecionada.');
    });

    updateShareControl();
  }

  async function hydrateCurrentParticipant() {
    const hydrationId = ++portraitHydrationId;
    const user = window.ChronusAuth?.getUser?.();
    const profile = window.ChronusAuth?.getProfile?.();
    let local = state.participants.find(item => item.isLocal);

    if (portraitObjectUrl) {
      URL.revokeObjectURL(portraitObjectUrl);
      portraitObjectUrl = '';
    }
    if (!local && user) {
      local = { id: `local:${user.id}`, userId: user.id, playerName: 'Carregando…', characterName: 'Personagem', role: 'Jogador', detail: 'Conectado', portrait: null, cameraArt: null, camera: false, microphone: false, speaking: false, isLocal: true };
      state.participants = state.participants.filter(item => !item.isLocal).concat(local);
    }
    if (!user) {
      if (isLocalPreview()) { renderAll(); return; }
      state.participants = state.participants.filter(item => !item.isLocal);
      const status = document.getElementById('chronus-live-connection-status');
      if (status?.querySelector('strong')) status.querySelector('strong').textContent = 'Entre para acessar a mesa';
      renderAll();
      return;
    }
    if (!local) return;
    local.portrait = null;
    local.cameraArt = null;
    local.playerName = 'Carregando…';
    local.characterName = 'Personagem';
    local.role = 'Jogador';
    local.detail = 'Conectado';

    if (rendered && window.location.hash.startsWith('#/live')) renderAll();

    local.playerName = profile?.display_name || user.email?.split('@')[0] || 'Jogador';

    currentIdentity = { userId: user.id, displayName: local.playerName, role: profile?.role === 'narrator' ? 'narrator' : 'player' };
    if (profile?.role === 'narrator') {
      local.characterName = 'Narrador da Crônica';
      local.role = 'Narrador';
      local.detail = 'Controle da sessão';
      if (rendered && window.location.hash.startsWith('#/live')) renderAll();
      if (window.location.hash.startsWith('#/live')) connectPresence();
      return;
    }

    const client = window.ChronusSupabase?.getClient?.();
    if (!client) {
      if (rendered && window.location.hash.startsWith('#/live')) renderAll();
      return;
    }

    try {
      const { data: character, error } = await client
        .from('characters')
        .select('name, data, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (hydrationId !== portraitHydrationId) return;

      const identity = character?.data?.identity || {};
      local.characterName = identity.name || character?.name || local.characterName;
      local.detail = identity.tradition || identity.concept || local.detail;

      const { data: portrait, error: portraitError } = await client.storage
        .from('portraits')
        .download(`${user.id}/portrait`);
      if (hydrationId !== portraitHydrationId) return;
      if (portraitError) {
        const missingPortrait = portraitError.statusCode === '404'
          || portraitError.status === 404
          || /not found|object not found/i.test(portraitError.message || '');
        if (!missingPortrait) {
          console.warn('CHRONUS LIVE: não foi possível carregar a foto da ficha; mantendo o quadro vazio.', portraitError);
        }
      } else if (portrait) {
        portraitObjectUrl = URL.createObjectURL(portrait);
        local.portrait = portraitObjectUrl;
        local.cameraArt = portraitObjectUrl;
      }
    } catch (error) {
      console.warn('CHRONUS LIVE: dados do personagem indisponíveis; mantendo o quadro sem foto.', error);
    }

    if (rendered && window.location.hash.startsWith('#/live')) renderAll();
    if (window.location.hash.startsWith('#/live')) connectPresence();
  }

  function updateParticipantCount() {
    const count = document.getElementById('chronus-live-participant-count');
    if (count) count.textContent = state.participants.length === 1 ? '1 participante conectado' : `${state.participants.length} participantes conectados`;
  }

  function applyPresenceState() {
    if (!presenceChannel) return;
    const next = [];
    const seenUsers = new Set();
    const presence = presenceChannel.presenceState?.() || {};
    Object.entries(presence).forEach(([key, entries]) => {
      (entries || []).forEach(entry => {
        const userId = typeof entry.user_id === 'string' ? entry.user_id : '';
        if (!userId || seenUsers.has(userId)) return;
        seenUsers.add(userId);
        // Presence payload fields are client-supplied; use our random channel key
        // (not user_id or role from the payload) to identify this browser tab.
        const isLocal = key === presenceKey;
        const existing = state.participants.find(item => item.id === `${userId}:${key}`);
        next.push({
          id: `${userId}:${key}`,
          userId,
          playerName: isLocal ? currentIdentity.displayName : (String(entry.display_name || 'Participante').slice(0, 80)),
          characterName: String(entry.character_name || (isLocal ? 'Personagem' : 'Participante')).slice(0, 80),
          role: isLocal && currentIdentity.role === 'narrator' ? 'Narrador' : 'Participante',
          detail: isLocal ? 'Você' : 'Conectado',
          portrait: isLocal ? (existing?.portrait || null) : null,
          cameraArt: null,
          camera: false,
          microphone: false,
          speaking: false,
          isLocal
        });
      });
    });
    state.participants = next;
    if (!next.some(item => item.id === state.spotlightId)) state.spotlightId = next.find(item => item.isLocal)?.id || next[0]?.id || '';
    renderAll();
  }

  async function disconnectPresence() {
    presenceGeneration += 1;
    const old = presenceChannel;
    presenceChannel = null;
    presenceKey = '';
    if (old) {
      try { await window.ChronusSupabase?.getClient?.()?.removeChannel(old); }
      catch (error) { console.warn('CHRONUS LIVE: falha ao sair da presença.', error); }
    }
  }

  async function connectPresence() {
    const generation = ++presenceGeneration;
    const db = window.ChronusSupabase?.getClient?.();
    const previous = presenceChannel;
    presenceChannel = null;
    if (previous && typeof db?.removeChannel === 'function') {
      try { await db.removeChannel(previous); }
      catch (error) { console.warn('CHRONUS LIVE: falha ao substituir presença anterior.', error); }
    }
    if (generation !== presenceGeneration) return;
    const statusEl = document.getElementById('chronus-live-connection-status');
    if (statusEl?.querySelector('strong')) statusEl.querySelector('strong').textContent = 'Validando acesso à sessão';
    if (statusEl?.querySelector('small')) statusEl.querySelector('small').textContent = 'Conferindo autenticação e vínculo';
    const sessionId = getActiveSessionId();
    if (!sessionId) {
      if (statusEl) statusEl.querySelector('strong').textContent = 'Selecione uma sessão válida';
      if (statusEl) statusEl.querySelector('small').textContent = 'A sala não usa mais um canal global';
      return;
    }
    if (!db || typeof db.channel !== 'function') {
      if (statusEl) statusEl.querySelector('strong').textContent = 'Serviço indisponível';
      return;
    }
    let authResult;
    try { authResult = await db.auth.getSession(); }
    catch (authError) {
      console.warn('CHRONUS LIVE: não foi possível validar a sessão autenticada.', authError);
      if (statusEl) statusEl.querySelector('strong').textContent = 'Falha ao validar autenticação';
      return;
    }
    const { data, error } = authResult;
    if (generation !== presenceGeneration || !window.location.hash.startsWith('#/live')) return;
    const user = data?.session?.user;
    if (error || !user) {
      if (statusEl) statusEl.querySelector('strong').textContent = 'Entre para acessar a mesa';
      presenceStatus = 'Não autenticado';
      return;
    }
    if (statusEl) statusEl.querySelector('strong').textContent = 'Validando perfil';
    const { data: profile, error: profileError } = await db.from('profiles').select('display_name, role').eq('id', user.id).maybeSingle();
    if (generation !== presenceGeneration || !window.location.hash.startsWith('#/live')) return;
    if (profileError || !profile || !['player', 'narrator'].includes(profile.role)) {
      state.participants = state.participants.filter(item => !item.isLocal);
      renderAll();
      if (statusEl) statusEl.querySelector('strong').textContent = 'Perfil sem acesso à mesa';
      return;
    }
    if (statusEl) statusEl.querySelector('strong').textContent = 'Validando vínculo com a sessão';
    const { data: liveSession, error: sessionError } = await db.from('campaign_sessions').select('id').eq('id', sessionId).maybeSingle();
    if (generation !== presenceGeneration || !window.location.hash.startsWith('#/live')) return;
    if (sessionError || !liveSession) {
      if (statusEl) statusEl.querySelector('strong').textContent = 'Sem acesso a esta sessão';
      if (statusEl) statusEl.querySelector('small').textContent = 'Peça ao Narrador para liberar seu acesso';
      return;
    }
    currentIdentity = { userId: user.id, displayName: profile.display_name || user.email?.split('@')[0] || 'Participante', role: profile.role, sessionId };
    const localParticipant = state.participants.find(item => item.isLocal);
    if (localParticipant) {
      localParticipant.playerName = currentIdentity.displayName;
      localParticipant.role = profile.role === 'narrator' ? 'Narrador' : 'Jogador';
      localParticipant.detail = profile.role === 'narrator' ? 'Controle da sessão' : 'Você';
    }
    if (statusEl) statusEl.querySelector('strong').textContent = 'Conectando presença';
    const character = state.participants.find(item => item.isLocal)?.characterName || 'Personagem';
    const key = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    presenceKey = key;
    const channel = db.channel(`chronus-live:session:${sessionId}`, { config: { private: true, presence: { key } } });
    presenceChannel = channel;
    channel.on('presence', { event: 'sync' }, applyPresenceState);
    channel.on('presence', { event: 'join' }, applyPresenceState);
    channel.on('presence', { event: 'leave' }, applyPresenceState);
    channel.subscribe(async status => {
      if (generation !== presenceGeneration || presenceChannel !== channel) return;
      presenceStatus = status;
      if (statusEl?.querySelector('small')) statusEl.querySelector('small').textContent = 'Realtime: ' + status;
      if (status === 'SUBSCRIBED') {
        if (statusEl) statusEl.querySelector('strong').textContent = 'Presença autorizada';
        if (statusEl?.querySelector('small')) statusEl.querySelector('small').textContent = 'Publicando seu participante…';
        try {
          const result = await channel.track({ user_id: user.id, display_name: currentIdentity.displayName, character_name: character });
          if (result === 'ok') {
            if (statusEl) statusEl.querySelector('strong').textContent = 'Mesa sincronizada';
            if (statusEl) statusEl.querySelector('small').textContent = 'Presença ativa · áudio/vídeo indisponíveis';
          }
        } catch (trackError) {
          console.warn('CHRONUS LIVE: não foi possível publicar presença.', trackError);
          if (statusEl) statusEl.querySelector('strong').textContent = 'Falha ao entrar na mesa';
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (statusEl) statusEl.querySelector('strong').textContent = 'Sem conexão · tentando novamente';
      }
    });
  }

  async function initializeSessionMembershipControls(sessionId) {
    const panel = document.getElementById('chronus-live-session-admin');
    const select = document.getElementById('chronus-live-member-player');
    const addButton = document.getElementById('chronus-live-member-add');
    const list = document.getElementById('chronus-live-session-members');
    const status = document.getElementById('chronus-live-session-admin-status');
    if (!panel || !select || !addButton || !list || !status) return;
    panel.hidden = true;
    if (!sessionId) return;
    const db = window.ChronusSupabase?.getClient?.();
    if (!db || typeof db.from !== 'function') return;
    const { data: authData, error: authError } = await db.auth.getSession();
    const user = authData?.session?.user;
    if (authError || !user) return;
    const { data: profile, error: profileError } = await db
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError || profile?.role !== 'narrator') return;
    panel.hidden = false;

    const refresh = async () => {
      status.textContent = 'Atualizando permissões…';
      const [playersResult, membersResult] = await Promise.all([
        db.from('profiles').select('id, display_name').eq('role', 'player').order('display_name').limit(200),
        db.from('chronus_live_session_members').select('user_id').eq('session_id', sessionId)
      ]);
      if (playersResult.error || membersResult.error) {
        status.textContent = 'Não foi possível carregar os acessos desta sessão';
        console.warn('CHRONUS LIVE: falha ao carregar membros da sessão.', playersResult.error || membersResult.error);
        return;
      }
      const players = playersResult.data || [];
      const memberIds = new Set((membersResult.data || []).map(member => member.user_id));
      select.replaceChildren(new Option('Selecione um jogador…', ''));
      players.filter(player => !memberIds.has(player.id)).forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = String(player.display_name || 'Jogador').slice(0, 80);
        select.appendChild(option);
      });
      if (select.options.length === 1) {
        select.options[0].textContent = players.length ? 'Todos os jogadores já têm acesso' : 'Nenhum jogador cadastrado';
      }
      list.replaceChildren();
      (membersResult.data || []).forEach(member => {
        const player = players.find(item => item.id === member.user_id);
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = String(player?.display_name || 'Jogador').slice(0, 80);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.removeUserId = member.user_id;
        remove.textContent = 'Remover';
        remove.setAttribute('aria-label', 'Remover ' + name.textContent + ' desta sessão');
        item.append(name, remove);
        list.appendChild(item);
      });
      status.textContent = (membersResult.data || []).length + ' jogador(es) autorizado(s)';
    };

    if (panel.dataset.bound !== 'true') {
      addButton.addEventListener('click', async () => {
        const targetUserId = select.value;
        if (!targetUserId) {
          status.textContent = 'Escolha um jogador antes de adicionar';
          return;
        }
        addButton.disabled = true;
        const { error } = await db.from('chronus_live_session_members').insert({
          session_id: getActiveSessionId(),
          user_id: targetUserId
        });
        addButton.disabled = false;
        if (error) {
          status.textContent = 'Não foi possível adicionar o jogador';
          console.warn('CHRONUS LIVE: falha ao adicionar membro.', error);
          return;
        }
        await refresh();
      });
      list.addEventListener('click', async event => {
        const remove = event.target?.closest?.('button[data-remove-user-id]');
        if (!remove) return;
        const targetUserId = remove.dataset.removeUserId;
        remove.disabled = true;
        const { error } = await db.from('chronus_live_session_members')
          .delete().eq('session_id', getActiveSessionId()).eq('user_id', targetUserId);
        if (error) {
          remove.disabled = false;
          status.textContent = 'Não foi possível remover o jogador';
          console.warn('CHRONUS LIVE: falha ao remover membro.', error);
          return;
        }
        await refresh();
      });
      panel.dataset.bound = 'true';
    }
    await refresh();
  }

  async function initializeSessionSelection() {
    const select = document.getElementById('chronus-live-session-select');
    if (!select) return;
    const db = window.ChronusSupabase?.getClient?.();
    if (!db || typeof db.from !== 'function') {
      select.replaceChildren(new Option('Entre para ver suas sessões', ''));
      return;
    }
    const { data, error } = await db
      .from('campaign_sessions')
      .select('id, title, session_number, status')
      .in('status', ['planned', 'in_progress'])
      .order('session_number', { ascending: false })
      .limit(50);
    if (!select.isConnected) return;
    if (error) {
      select.replaceChildren(new Option('Não foi possível carregar', ''));
      console.warn('CHRONUS LIVE: falha ao listar sessões autorizadas.', error);
      return;
    }
    const sessions = data || [];
    select.replaceChildren(new Option('Escolha uma sessão…', ''));
    sessions.forEach(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = [session.session_number, session.title].filter(Boolean).join(' · ').slice(0, 140);
      select.appendChild(option);
    });
    const requestedId = getActiveSessionId();
    const requested = sessions.find(session => session.id === requestedId);
    if (!requested) void initializeSessionMembershipControls('');
    if (requested) {
      select.value = requested.id;
      const heading = document.getElementById('chronus-live-session-heading');
      if (heading) heading.textContent = requested.title;
      void initializeSessionMembershipControls(requested.id);
    } else if (!requestedId && sessions.length === 1) {
      select.value = sessions[0].id;
      window.location.hash = '#/live?session=' + encodeURIComponent(sessions[0].id);
    } else if (requestedId) {
      select.value = '';
      const status = document.getElementById('chronus-live-connection-status');
      if (status?.querySelector('strong')) status.querySelector('strong').textContent = 'Sem acesso a esta sessão';
    }
    select.onchange = () => {
      const id = select.value;
      if (!id) {
        window.location.hash = '#/live';
        return;
      }
      window.location.hash = '#/live?session=' + encodeURIComponent(id);
    };
  }

  function load() {
    ensureStylesheet();
    if (!rendered || !getRoot()?.querySelector('.chronus-live-room')) buildShell();
    void connectPresence();
    hydrateCurrentParticipant();
    void initializeSessionSelection();
    window.ChronusNarrativeLive?.mountSharedRollFeed?.(document.getElementById('chronus-live-feed'), getActiveSessionId());
    document.documentElement.dataset.chronusLive = PREVIEW_MARKER;
    if (isLocalPreview()) document.documentElement.dataset.chronusLiveLocalPreview = 'true';
  }

  function init() {
    if (initialized) return true;
    initialized = true;
    ensureStylesheet();
    window.ChronusAuth?.onAuthChange?.(() => {
      if (window.location.hash.startsWith('#/live')) {
        void disconnectPresence();
        hydrateCurrentParticipant();
      }
    });
    if (window.location.hash.startsWith('#/live')) load();
    document.documentElement.dataset.chronusLive = PREVIEW_MARKER;
    return true;
  }

  return Object.freeze({
    init,
    load,
    unmount: disconnectPresence,
    mediaStateFor: participant => mediaDescriptor(participant).state,
    getActiveSessionId,
    mode: 'presence-enabled',
    marker: PREVIEW_MARKER
  });
})();
