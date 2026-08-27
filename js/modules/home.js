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
  const HERO_ART = 'assets/art/hero-berlin-1992.webp';

  function init() {
    setupV13Styles();
    setupCinematicHero();
    setupChronicleScene();
    setupSessionsScene();
    setupNpcsScene();
    setupLocationsScene();
    setupFilesScene();
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
          <p class="sessions-scene-lead">Cada encontro deixa vestígios: datas, pistas, decisões, feridas e contradições. O diário reúne os fatos que a mesa testemunhou — e os detalhes que só fazem sentido quando vistos em sequência.</p>
          <div class="sessions-timeline" aria-label="Exemplo visual da cronologia das sessões">
            <div class="sessions-timeline-item"><time datetime="1992-05-07">07 · MAI · 1992</time><strong>Marcas na cidade</strong><span>Símbolos desconhecidos surgem nos muros.</span></div>
            <div class="sessions-timeline-item"><time datetime="1992-05-09">09 · MAI · 1992</time><strong>Arquivos interrompidos</strong><span>Documentos antigos apontam para algo que deveria ter permanecido enterrado.</span></div>
            <div class="sessions-timeline-item"><time datetime="1992-05-12">12 · MAI · 1992</time><strong>Distorções</strong><span>Relatos incompatíveis começam a formar um mesmo padrão.</span></div>
          </div>
          <a class="sessions-scene-link" href="#/sessions" aria-label="Abrir o Diário de Sessões do CHRONUS"><span aria-hidden="true">▣</span> Abrir Diário de Sessões <span aria-hidden="true">→</span></a>
        </div>`;
      chronicleScene.insertAdjacentElement('afterend', scene);
    }
    const sessionsCard = editorial.querySelector('.editorial-cards-grid > .editorial-card:nth-child(2)');
    promoteCardToScene(sessionsCard, 'sessions');
  }

  function setupNpcsScene() {
    const home = document.getElementById('view-home');
    const sessionsScene = home?.querySelector('.sessions-scene-v13');
    const editorial = home?.querySelector('.editorial-section');
    if (!home || !sessionsScene || !editorial) return;

    if (!home.querySelector('.npcs-scene-v13')) {
      const scene = document.createElement('section');
      scene.className = 'npcs-scene-v13';
      scene.setAttribute('aria-labelledby', 'npcs-scene-title');
      scene.innerHTML = `
        <div class="npcs-scene-head"><div><div class="npcs-scene-index">03 · Pessoas, entidades e máscaras</div><div class="npcs-scene-kicker">Arquivo confidencial</div><h2 class="npcs-scene-title" id="npcs-scene-title">Dossiê de NPCs</h2></div><p class="npcs-scene-intro">Nem todo rosto tem um nome verdadeiro. O dossiê reúne contatos, testemunhas, autoridades, aliados e presenças sobrenaturais já encontradas — separando o que a mesa sabe daquilo que continua sob suspeita.</p></div>
        <div class="npcs-dossier-grid" aria-label="Amostra visual do Dossiê de NPCs">
          <article class="npc-dossier-card"><div class="npc-dossier-portrait" role="img" aria-label="Retrato documental de um contato conhecido"></div><div class="npc-dossier-topline"><span class="npc-dossier-code">ARQ · 021</span><span class="npc-dossier-status is-known">Conhecido</span></div><div class="npc-dossier-content"><div class="npc-dossier-role">Contato confirmado</div><h3 class="npc-dossier-name">Fonte sob proteção</h3><p class="npc-dossier-relation">Relação com a Crônica: informação recorrente e acesso a setores civis da cidade.</p><div class="npc-dossier-metrics"><div class="npc-dossier-metric npc-threat-low"><span>Ameaça</span><strong>Baixa</strong></div><div class="npc-dossier-metric"><span>Confiança</span><strong>Parcial</strong></div></div></div></article>
          <article class="npc-dossier-card"><div class="npc-dossier-portrait" role="img" aria-label="Retrato obscurecido de identidade não confirmada"></div><div class="npc-dossier-topline"><span class="npc-dossier-code">ARQ · ???</span><span class="npc-dossier-status is-unknown">Não identificado</span></div><div class="npc-dossier-content"><div class="npc-dossier-role">Presença recorrente</div><h3 class="npc-dossier-name">Identidade desconhecida</h3><p class="npc-dossier-relation">Relação com a Crônica: observada em registros incompatíveis. Motivações ainda não determinadas.</p><div class="npc-dossier-metrics"><div class="npc-dossier-metric npc-threat-unknown"><span>Ameaça</span><strong>Incerta</strong></div><div class="npc-dossier-metric"><span>Status</span><strong>Vigilância</strong></div></div></div></article>
          <article class="npc-dossier-card"><div class="npc-dossier-portrait" role="img" aria-label="Retrato documental de um alvo classificado como perigoso"></div><div class="npc-dossier-topline"><span class="npc-dossier-code">ARQ · 009</span><span class="npc-dossier-status is-known">Confirmado</span></div><div class="npc-dossier-content"><div class="npc-dossier-role">Alvo de interesse</div><h3 class="npc-dossier-name">Sujeito sob vigilância</h3><p class="npc-dossier-relation">Relação com a Crônica: conexão direta com eventos ainda não explicados e múltiplas versões do mesmo relato.</p><div class="npc-dossier-metrics"><div class="npc-dossier-metric npc-threat-high"><span>Ameaça</span><strong>Alta</strong></div><div class="npc-dossier-metric"><span>Contato</span><strong>Evitar</strong></div></div></div></article>
        </div>
        <div class="npcs-confidential-note"><span class="npcs-confidential-stamp">Confidencial · acesso de campo</span><span>As classificações representam apenas o que os personagens conhecem. Verdades ocultas permanecem protegidas pela própria Crônica.</span><a class="npcs-scene-link" href="#/npcs" aria-label="Consultar o Dossiê completo de NPCs do CHRONUS">Consultar Dossiê <span aria-hidden="true">→</span></a></div>`;
      sessionsScene.insertAdjacentElement('afterend', scene);
    }
    const npcsCard = editorial.querySelector('.editorial-cards-grid > .editorial-card:nth-child(3)');
    promoteCardToScene(npcsCard, 'npcs');
  }

  function setupLocationsScene() {
    const home = document.getElementById('view-home');
    const npcsScene = home?.querySelector('.npcs-scene-v13');
    const editorial = home?.querySelector('.editorial-section');
    if (!home || !npcsScene || !editorial) return;

    if (!home.querySelector('.locations-scene-v13')) {
      const scene = document.createElement('section');
      scene.className = 'locations-scene-v13';
      scene.setAttribute('aria-labelledby', 'locations-scene-title');
      scene.innerHTML = `
        <div class="locations-atlas-stamp" aria-hidden="true">Atlas de Campo · Berlim 1992</div>
        <div class="locations-scene-head">
          <div><div class="locations-scene-index">04 · Onde tudo está acontecendo</div><div class="locations-scene-kicker">Atlas oculto de Berlim</div><h2 class="locations-scene-title" id="locations-scene-title">Locais</h2></div>
          <p class="locations-scene-intro">Berlim não é apenas cenário. É uma malha de cicatrizes, fronteiras, ruínas e zonas de influência. O atlas registra pontos conhecidos, áreas instáveis e lugares onde o Véu parece mais fino do que deveria.</p>
        </div>
        <div class="locations-atlas-shell">
          <div class="locations-atlas-map" role="img" aria-label="Atlas de campo estilizado de Berlim com setores, zonas de risco e pontos de interesse">
            <div class="locations-map-header"><span class="locations-map-chip">Berlim · Arquivo 04</span><span class="locations-map-chip">Camada: campo</span><span class="locations-map-chip">Escala: urbana</span><span class="locations-map-chip">Atualização: 1992</span></div>
            <div class="locations-map-crosshair" aria-hidden="true"></div>
            <span class="locations-map-node" data-label="Setor central">01</span><span class="locations-map-node is-risk" data-label="Zona anômala">02</span><span class="locations-map-node" data-label="Ponto histórico">03</span><span class="locations-map-node is-unknown" data-label="Não catalogado">04</span><span class="locations-map-node is-risk" data-label="Acesso restrito">05</span>
            <div class="locations-map-coordinate">52°31′N · 13°24′E · CAMADA CHRONUS</div>
          </div>
          <div class="locations-atlas-panel">
            <div class="locations-atlas-panel-head"><strong>Índice de campo</strong><span>Exemplos de leitura do território — sem revelar informações ocultas do Narrador.</span></div>
            <div class="locations-place-list">
              <article class="locations-place-card"><span class="locations-place-number">01</span><div><h3>Alexanderplatz</h3><p>Setor central. Movimento constante, observação difícil e relatos de padrões que se repetem entre a multidão.</p><div class="locations-place-tags"><span class="locations-place-tag">Conhecido</span><span class="locations-place-tag">Centro</span><span class="locations-place-tag">Risco moderado</span></div></div></article>
              <article class="locations-place-card is-high"><span class="locations-place-number">02</span><div><h3>Bunker abandonado</h3><p>Acesso restrito. Registros incompletos, infraestrutura antiga e ecos que não correspondem à acústica do local.</p><div class="locations-place-tags"><span class="locations-place-tag is-risk">Anômalo</span><span class="locations-place-tag">Restrito</span><span class="locations-place-tag is-risk">Risco alto</span></div></div></article>
              <article class="locations-place-card"><span class="locations-place-number">03</span><div><h3>Trecho remanescente do Muro</h3><p>Ponto histórico sensível. Marcas, memórias e relatos contraditórios se concentram no mesmo perímetro.</p><div class="locations-place-tags"><span class="locations-place-tag">Histórico</span><span class="locations-place-tag">Sob investigação</span><span class="locations-place-tag">Risco indeterminado</span></div></div></article>
            </div>
            <div class="locations-atlas-legend" aria-label="Legenda do Atlas"><span class="locations-legend-item"><i class="locations-legend-dot"></i>Conhecido</span><span class="locations-legend-item"><i class="locations-legend-dot is-anomaly"></i>Anômalo</span><span class="locations-legend-item"><i class="locations-legend-dot is-unknown"></i>Não catalogado</span><span class="locations-legend-item"><i class="locations-legend-dot is-restricted"></i>Restrito</span></div>
            <div class="locations-scene-footer"><span class="locations-field-note">O atlas mostra apenas o território já reconhecido pela mesa. Zonas desconhecidas continuam fora do mapa dos personagens.</span><a class="locations-scene-link" href="#/maps" aria-label="Abrir o Atlas e os Locais do CHRONUS">Abrir Atlas <span aria-hidden="true">→</span></a></div>
          </div>
        </div>`;
      npcsScene.insertAdjacentElement('afterend', scene);
    }
    const locationsCard = editorial.querySelector('.editorial-cards-grid > .editorial-card:nth-child(4)');
    promoteCardToScene(locationsCard, 'locations');
  }

  function setupFilesScene() {
    const home = document.getElementById('view-home');
    const locationsScene = home?.querySelector('.locations-scene-v13');
    const editorial = home?.querySelector('.editorial-section');
    if (!home || !locationsScene || !editorial) return;

    if (!home.querySelector('.files-scene-v13')) {
      const scene = document.createElement('section');
      scene.className = 'files-scene-v13';
      scene.setAttribute('aria-labelledby', 'files-scene-title');
      scene.innerHTML = `
        <div class="files-scene-head">
          <div><div class="files-scene-index">05 · O que sobrou depois dos fatos</div><div class="files-scene-kicker">Evidências confiscadas</div><h2 class="files-scene-title" id="files-scene-title">Arquivos</h2></div>
          <p class="files-scene-intro">Fotografias, cartas, recortes e relatórios não contam a verdade sozinhos. O arquivo reúne materiais recuperados pela mesa, preservando lacunas, censuras e contradições sem revelar informações que ainda pertencem ao Narrador.</p>
        </div>
        <div class="files-evidence-board">
          <div class="files-board-surface" aria-label="Painel visual de evidências com documentos, fotografia, recorte de jornal e material censurado">
            <div class="files-board-label"><span class="files-board-chip">Caso 05 · custódia ativa</span><span class="files-board-chip">Origem: campo</span><span class="files-board-chip">Integridade: parcial</span></div>
            <span class="files-pin" aria-hidden="true"></span><span class="files-pin" aria-hidden="true"></span><span class="files-pin" aria-hidden="true"></span>
            <article class="files-paper files-paper-report"><h3>Relatório de Ocorrência</h3><span class="files-paper-meta">Registro recuperado · cópia parcial</span><p>O depoente afirma ter ouvido <span class="files-redaction is-long" aria-label="trecho censurado"></span> antes da interrupção da energia.</p><p>A equipe registrou marcas no concreto próximas ao setor <span class="files-redaction is-short" aria-label="trecho censurado"></span>.</p><p>Encaminhar o material ao responsável por <span class="files-redaction" aria-label="trecho censurado"></span> antes de novo acesso.</p></article>
            <article class="files-paper files-paper-letter"><h3>Carta não enviada</h3><span class="files-paper-meta">Data incerta · remetente preservado</span><p>“Se você encontrar esta página, não volte ao lugar onde nos vimos. Eles começaram a perguntar sobre a fotografia.”</p><p>“O nome que aparece no registro não é o mesmo que eu ouvi.”</p></article>
            <figure class="files-evidence-photo" aria-label="Fotografia de evidência de Berlim noturna"></figure>
            <article class="files-clipping"><strong>Ocorrências noturnas voltam a preocupar moradores</strong><p>Testemunhas descrevem falhas de energia e movimentação incomum em áreas antes isoladas. Autoridades tratam os relatos como coincidência.</p></article>
            <div class="files-confiscated-stamp" aria-hidden="true">Confiscado · CHRONUS</div>
          </div>
          <aside class="files-case-panel" aria-label="Índice das evidências recuperadas">
            <div class="files-case-head"><strong>Índice de evidências</strong><span>A leitura abaixo representa somente materiais já liberados aos personagens.</span></div>
            <div class="files-evidence-list">
              <article class="files-evidence-item"><span class="files-evidence-id">17-B</span><div><h3>Fotografia de campo</h3><p>Imagem deteriorada com origem não confirmada e detalhes ainda sob análise.</p></div><span class="files-evidence-status">Catalogada</span></article>
              <article class="files-evidence-item"><span class="files-evidence-id">22-C</span><div><h3>Relatório incompleto</h3><p>Cópia com trechos ausentes, numeração irregular e referências incompatíveis.</p></div><span class="files-evidence-status is-sensitive">Censurado</span></article>
              <article class="files-evidence-item"><span class="files-evidence-id">31-A</span><div><h3>Carta interceptada</h3><p>Documento pessoal recuperado; autenticidade e destinatário permanecem em investigação.</p></div><span class="files-evidence-status">Parcial</span></article>
              <article class="files-evidence-item"><span class="files-evidence-id">44-D</span><div><h3>Recorte de jornal</h3><p>Notícia pública que ganha outro significado quando comparada às demais peças do caso.</p></div><span class="files-evidence-status">Público</span></article>
            </div>
            <div class="files-access-note">Trechos censurados existem para representar informação ainda não liberada à mesa. O painel não expõe segredos de Narrador.</div>
            <div class="files-scene-footer"><span class="files-case-code">ARQ/BER/1992 · NÍVEL DE CAMPO</span><a class="files-scene-link" href="#/files" aria-label="Examinar os Arquivos da Crônica CHRONUS">Examinar Evidências <span aria-hidden="true">→</span></a></div>
          </aside>
        </div>`;
      locationsScene.insertAdjacentElement('afterend', scene);
    }

    const filesCard = editorial.querySelector('.editorial-cards-grid > .editorial-card:nth-child(5)');
    promoteCardToScene(filesCard, 'files');
  }

  function promoteCardToScene(card, sceneName) {
    if (!card) return;
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
    card.dataset.promotedToScene = sceneName;
  }

  function setupHeroCta() {
    document.getElementById('hero-btn-chronicle')?.addEventListener('click', () => window.ChronusRouter.navigateTo('#/chronicle'));
    document.getElementById('hero-btn-universe')?.addEventListener('click', () => window.ChronusRouter.navigateTo('#/system'));
    document.getElementById('hero-btn-player-area')?.addEventListener('click', () => {
      const user = window.ChronusAuth?.getUser();
      const profile = window.ChronusAuth?.getProfile();
      if (!user) window.ChronusAuth?.showAuthModal();
      else if (profile?.role === 'narrator') window.ChronusRouter.navigateTo('#/narrator');
      else window.ChronusRouter.navigateTo('#/player');
    });
  }

  return { init };
})();