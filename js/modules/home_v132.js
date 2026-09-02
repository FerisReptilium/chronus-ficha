/**
 * CHRONUS v1.3.2 — reconstrução editorial controlada da Home.
 *
 * Mantém as rotas, autenticação e páginas internas da v1.3.1. Esta camada
 * substitui somente a apresentação da Home. O art-pack v1.3.2 foi criado
 * depois da aprovação do wireframe e não sobrescreve os assets da v1.3.1.
 */
window.ChronusHomeV132 = (function() {
  const STYLE_HREF = 'css/editorial-v132-rebuild.css';
  const LEGACY_SCENES = [
    '.chronicle-scene-v13',
    '.sessions-scene-v13',
    '.npcs-scene-v13',
    '.locations-scene-v13',
    '.files-scene-v13',
    '.library-scene-v13'
  ];

  function ensureStylesheet() {
    if (document.querySelector('link[data-chronus-v132="editorial-rebuild"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.chronusV132 = 'editorial-rebuild';
    document.head.appendChild(link);
  }

  function rebuildHero(home) {
    const hero = home.querySelector('.hero-cinematic');
    const content = hero?.querySelector('.hero-content');
    if (!hero || !content) return false;

    hero.classList.add('hero-v132');
    hero.querySelector('.hero-v13-atmosphere')?.remove();
    hero.querySelector('.hero-v13-scroll')?.remove();
    hero.querySelector('.hero-v13-context')?.remove();

    const badge = content.querySelector('.hero-sigil-badge span');
    const title = content.querySelector('.hero-main-title');
    const subtitle = content.querySelector('.hero-subtitle');
    const quote = content.querySelector('.hero-quote');
    if (badge) badge.textContent = 'Berlim · 1990';
    if (title) title.textContent = 'CHRONUS';
    if (subtitle) subtitle.textContent = 'Ecologia Sobrenatural';
    if (quote) quote.textContent = 'O mundo não mudou. Você apenas começou a enxergá-lo.';

    const chronicleButton = document.getElementById('hero-btn-chronicle');
    const universeButton = document.getElementById('hero-btn-universe');
    const playerButton = document.getElementById('hero-btn-player-area');
    if (chronicleButton) chronicleButton.innerHTML = '<span>Entrar na crônica</span><span aria-hidden="true">→</span>';
    if (universeButton) universeButton.innerHTML = '<span>Conhecer o universo</span><span aria-hidden="true">→</span>';
    if (playerButton) playerButton.hidden = true;

    if (!hero.querySelector('.hero-v132-art')) {
      const art = document.createElement('div');
      art.className = 'hero-v132-art';
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label', 'Berlim noturna após a queda do Muro, cenário da Crônica CHRONUS');
      art.innerHTML = '<span class="hero-v132-art-index">Dossiê 01 / Berlim</span><span class="hero-v132-art-caption">O Véu está cedendo</span>';
      hero.appendChild(art);
    }

    if (!hero.querySelector('.hero-v132-rail')) {
      const rail = document.createElement('div');
      rail.className = 'hero-v132-rail';
      rail.setAttribute('aria-hidden', 'true');
      rail.innerHTML = '<span>Horror oculto</span><i></i><span>Investigação urbana</span>';
      hero.appendChild(rail);
    }

    return true;
  }

  function editorialMarkup() {
    return `
      <div class="home-v132" aria-label="Apresentação editorial do universo CHRONUS">
        <section class="v132-opening" aria-labelledby="v132-opening-title">
          <div class="v132-opening-copy">
            <span class="v132-index">01 / A cidade depois do Muro</span>
            <p class="v132-kicker">Crônica em andamento</p>
            <h2 id="v132-opening-title">Berlim nunca voltou a ser uma cidade inteira.</h2>
            <p class="v132-lead">Em 1990, liberdade e ruína dividem as mesmas ruas. Bunkers esquecidos, arquivos da Stasi e clubes clandestinos escondem sinais de uma ecologia sobrenatural que voltou a respirar.</p>
            <p>CHRONUS acompanha os Despertos que atravessam esse território — reunindo pistas, enfrentando consequências e descobrindo quem se beneficiou quando o Véu começou a ceder.</p>
            <a class="v132-text-link" href="#/chronicle">Ler a crônica <span aria-hidden="true">→</span></a>
          </div>
          <figure class="v132-opening-art">
            <img src="assets/art/v132-atlas.webp" width="1448" height="1086" alt="Mapa urbano de Berlim e materiais de investigação do Atlas CHRONUS">
            <figcaption><span>Atlas 1990</span><strong>Uma cidade dividida por memórias e territórios invisíveis.</strong></figcaption>
          </figure>
        </section>

        <section class="v132-pillars" aria-labelledby="v132-pillars-title">
          <header class="v132-section-head">
            <div><span class="v132-index">02 / Portas de entrada</span><p class="v132-kicker">O universo oculto</p></div>
            <h2 id="v132-pillars-title">Três formas de atravessar o Véu.</h2>
          </header>
          <div class="v132-pillar-grid">
            <a class="v132-pillar" href="#/chronicle">
              <img src="assets/art/v132-hero-berlin.webp" width="1672" height="941" alt="Investigador solitário diante do Muro de Berlim sob chuva">
              <span class="v132-pillar-number">I</span><div><p>História viva</p><h3>A Crônica</h3><span>Capítulos, revelações e consequências da mesa.</span></div>
            </a>
            <a class="v132-pillar" href="#/system">
              <img src="assets/art/v132-documents.webp" width="1586" height="992" alt="Mesa com documentos e equipamentos de investigação do universo CHRONUS">
              <span class="v132-pillar-number">II</span><div><p>Regras da realidade</p><h3>O Sistema</h3><span>Ficção, dados de ação, Mana e Paradoxo.</span></div>
            </a>
            <a class="v132-pillar" href="#/library">
              <img src="assets/art/v132-library.webp" width="1586" height="992" alt="Acervo subterrâneo da Biblioteca CHRONUS">
              <span class="v132-pillar-number">III</span><div><p>Conhecimento preservado</p><h3>A Biblioteca</h3><span>Manuais, guias e documentos para a mesa.</span></div>
            </a>
          </div>
        </section>

        <section class="v132-session" aria-labelledby="v132-session-title">
          <div class="v132-session-art">
            <img src="assets/art/v132-sessions.webp" width="1660" height="948" alt="Dois investigadores examinam uma passagem subterrânea em Berlim">
            <span class="v132-session-stamp">Registro de campo</span>
          </div>
          <div class="v132-session-copy">
            <span class="v132-index">03 / Últimos registros</span>
            <p class="v132-kicker">Diário de sessões</p>
            <h2 id="v132-session-title">Cada encontro deixa um vestígio.</h2>
            <p>Datas, pistas, decisões e feridas permanecem organizadas em uma cronologia única. O diário mostra somente o que a mesa testemunhou — sem antecipar os segredos do Narrador.</p>
            <ol class="v132-session-list">
              <li><time datetime="1990-05-07">07 mai 1990</time><span>Marcas na cidade</span></li>
              <li><time datetime="1990-05-09">09 mai 1990</time><span>Arquivos interrompidos</span></li>
              <li><time datetime="1990-05-12">12 mai 1990</time><span>Distorções</span></li>
            </ol>
            <a class="v132-text-link" href="#/sessions">Abrir diário de sessões <span aria-hidden="true">→</span></a>
          </div>
        </section>

        <section class="v132-archive" aria-labelledby="v132-archive-title">
          <header class="v132-section-head v132-section-head-wide">
            <div><span class="v132-index">04 / O que a mesa conhece</span><p class="v132-kicker">Atlas e dossiês</p></div>
            <h2 id="v132-archive-title">Pessoas e lugares formam o mesmo mapa.</h2>
            <p>Contatos, ameaças, testemunhas e zonas de interesse são apresentados como partes de uma única investigação.</p>
          </header>
          <div class="v132-archive-grid">
            <a class="v132-atlas-card" href="#/maps">
              <img src="assets/art/v132-atlas.webp" width="1448" height="1086" alt="Mapa e evidências do Atlas dos locais investigados em Berlim">
              <span class="v132-card-label">Atlas</span><strong>Territórios reconhecidos</strong><small>Explorar locais →</small>
            </a>
            <div class="v132-dossiers" aria-label="Amostra do Dossiê de NPCs">
              <a class="v132-dossier" href="#/npcs"><img src="assets/art/v132-npc-contact.webp" width="1122" height="1402" alt="Arquivista catalogada como contato conhecido no Dossiê"><span>021</span><strong>Contato</strong></a>
              <a class="v132-dossier" href="#/npcs"><img src="assets/art/v132-npc-unknown.webp" width="1122" height="1402" alt="Identidade desconhecida observada em uma plataforma de metrô"><span>???</span><strong>Incógnita</strong></a>
              <a class="v132-dossier" href="#/npcs"><img src="assets/art/v132-npc-threat.webp" width="1122" height="1402" alt="Figura institucional catalogada como ameaça no Dossiê"><span>008</span><strong>Ameaça</strong></a>
            </div>
          </div>
          <div class="v132-archive-links"><a href="#/files">Examinar arquivos <span aria-hidden="true">→</span></a><a href="#/npcs">Abrir dossiê completo <span aria-hidden="true">→</span></a></div>
        </section>

        <section class="v132-library" aria-labelledby="v132-library-title">
          <div class="v132-library-copy"><span class="v132-index">05 / Acervo de referência</span><p class="v132-kicker">Biblioteca CHRONUS</p><h2 id="v132-library-title">Leve o universo para a mesa.</h2><p>Manuais, guias rápidos e documentos de apoio reunidos sem misturar regras, ambientação e informações restritas.</p><a class="v132-text-link" href="#/library">Acessar biblioteca <span aria-hidden="true">→</span></a></div>
          <div class="v132-library-art" role="img" aria-label="Três volumes editoriais do acervo CHRONUS: Manual, Guia e Arquivo">
            <span class="v132-library-volume v132-volume-manual"><i aria-hidden="true">✦</i><strong>Manual</strong><small>Fundamentos · I</small></span>
            <span class="v132-library-volume v132-volume-guide"><i aria-hidden="true">◇</i><strong>Guia</strong><small>Mesa rápida · II</small></span>
            <span class="v132-library-volume v132-volume-archive"><i aria-hidden="true">⌁</i><strong>Arquivo</strong><small>Casos K-17 · III</small></span>
          </div>
        </section>
      </div>`;
  }

  function replaceLegacyHome(home) {
    LEGACY_SCENES.forEach(selector => home.querySelector(selector)?.remove());
    const editorial = home.querySelector('.editorial-section');
    if (editorial) editorial.hidden = true;

    if (!home.querySelector('.home-v132')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = editorialMarkup().trim();
      const rebuilt = wrapper.firstElementChild;
      const footer = home.querySelector('.portal-footer');
      if (footer) footer.insertAdjacentElement('beforebegin', rebuilt);
      else home.appendChild(rebuilt);
    }
  }

  function init() {
    const home = document.getElementById('view-home');
    if (!home) return false;
    ensureStylesheet();
    if (!rebuildHero(home)) return false;
    replaceLegacyHome(home);
    home.classList.add('is-v132-editorial');
    document.documentElement.dataset.chronusHome = 'v1.3.2-art-preview';
    return true;
  }

  return { init };
})();
