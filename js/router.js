/**
 * CHRONUS — Hash Router & View Switcher
 * Gerencia navegação SPA sem recarga e sem dependência de rotas no servidor.
 */
window.ChronusRouter = (function() {
  const routes = {
    '#/home': { viewId: 'view-home', title: 'Início · CHRONUS' },
    '#/player': { viewId: 'view-player', title: 'Minha Área · CHRONUS', authRequired: true },
    '#/narrator': { viewId: 'view-narrator', title: 'Painel do Narrador · CHRONUS', narratorOnly: true },
    '#/live': { viewId: 'view-live', title: 'CHRONUS LIVE · Sala da Crônica', authRequired: true },
    '#/sheet': { viewId: 'view-sheet', title: 'Ficha Digital · CHRONUS', authRequired: true },
    '#/chronicle': { viewId: 'view-chronicle', title: 'Crônica · CHRONUS' },
    '#/sessions': { viewId: 'view-sessions', title: 'Sessões · CHRONUS' },
    '#/npcs': { viewId: 'view-npcs', title: 'NPCs · CHRONUS' },
    '#/maps': { viewId: 'view-maps', title: 'Mapas & Locais · CHRONUS' },
    '#/files': { viewId: 'view-files', title: 'Arquivos da Crônica · CHRONUS' },
    '#/soundtrack': { viewId: 'view-soundtrack', title: 'Trilha Sonora · CHRONUS' },
    '#/system': { viewId: 'view-system', title: 'O Sistema · CHRONUS' },
    '#/library': { viewId: 'view-library', title: 'Biblioteca · CHRONUS' },
    '#/login': { viewId: 'view-home', openAuth: true }
  };

  let currentRoute = '#/home';

  function init() {
    window.addEventListener('hashchange', handleRouteChange);
    setupMobileMenu();
    handleRouteChange();
  }

  function allowsLocalLivePreview(cleanHash, fullHash) {
    if (cleanHash !== '#/live') return false;
    if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') return false;
    const query = fullHash.includes('?') ? fullHash.split('?')[1] : '';
    return new URLSearchParams(query).get('preview') === '1';
  }

  function handleRouteChange() {
    let hash = window.location.hash || '#/home';
    const queryIdx = hash.indexOf('?');
    let cleanHash = queryIdx !== -1 ? hash.substring(0, queryIdx) : hash;

    if (!routes[cleanHash]) {
      cleanHash = '#/home';
      window.location.hash = '#/home';
      return;
    }

    const routeDef = routes[cleanHash];
    currentRoute = cleanHash;

    // Não renderize uma ficha anterior enquanto a conta autenticada está
    // sendo reidratada após troca de usuário ou migração de cache.
    if (cleanHash === '#/sheet' && window.__CHRONUS_ACCOUNT_REHYDRATION_PENDING === true) {
      window.location.hash = '#/home';
      return;
    }

    // Checagem de Proteção de Rota
    const user = window.ChronusAuth?.getUser();
    const profile = window.ChronusAuth?.getProfile();

    if (routeDef.authRequired && !user && !allowsLocalLivePreview(cleanHash, hash)) {
      window.ChronusAuth?.showAuthModal('Faça login para acessar sua área de jogador.');
      window.location.hash = '#/home';
      return;
    }

    if (routeDef.narratorOnly && (!user || profile?.role !== 'narrator')) {
      if (!user) {
        window.ChronusAuth?.showAuthModal('Acesso restrito ao Narrador. Faça login.');
      } else {
        alert('Acesso exclusivo ao Narrador.');
      }
      window.location.hash = '#/home';
      return;
    }

    if (routeDef.openAuth) {
      window.ChronusAuth?.showAuthModal();
      window.location.hash = '#/home';
      return;
    }

    // Alternar visualizações ativas
    document.querySelectorAll('.portal-view').forEach(view => {
      view.hidden = true;
      view.classList.remove('is-active');
    });

    const targetView = document.getElementById(routeDef.viewId);
    if (targetView) {
      targetView.hidden = false;
      targetView.classList.add('is-active');
    }

    // Se estiver na rota da ficha, ajusta o body/layout
    document.body.classList.toggle('in-live-mode', cleanHash === '#/live');
    document.body.classList.toggle('in-player-mode', cleanHash === '#/player');

    if (cleanHash === '#/sheet') {
      document.body.classList.add('in-sheet-mode');
      const params = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
      if (params.get('narratorView') === '1') {
        window.ChronusSheetEngine?.applyNarratorViewMode?.();
      } else {
        window.ChronusSheetEngine?.applyPlayerViewMode?.();
      }
    } else {
      document.body.classList.remove('in-sheet-mode');
    }

    // Se for rota de dashboard ou conteúdo, recarrega dados atualizados
    if (cleanHash === '#/player') {
      window.ChronusPlayerDashboard?.load();
    } else if (cleanHash === '#/narrator') {
      window.ChronusNarratorPanel?.load();
    } else if (cleanHash === '#/live') {
      window.ChronusLiveV140?.load?.();
    } else if (cleanHash === '#/chronicle') {
      window.ChronusChronicle?.load?.();
    } else if (cleanHash === '#/sessions') {
      window.ChronusSessions?.load?.();
    } else if (cleanHash === '#/npcs') {
      window.ChronusNpcs?.load?.();
    } else if (cleanHash === '#/maps') {
      window.ChronusLocations?.load?.();
    } else if (cleanHash === '#/files') {
      window.ChronusDocuments?.load?.();
    } else if (cleanHash === '#/soundtrack') {
      window.ChronusSoundtrack?.load?.();
    } else if (cleanHash === '#/library') {
      window.ChronusLibrary?.load?.();
    }

    // Atualizar links ativos no Navbar
    document.querySelectorAll('.nav-link').forEach(link => {
      const linkHash = link.getAttribute('href');
      link.classList.toggle('is-active', linkHash === cleanHash);
    });

    // Fechar menu mobile se aberto
    closeMobileMenu();

    // Rolar ao topo
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Atualizar título da aba
    if (routeDef.title) document.title = routeDef.title;
  }

  function setupMobileMenu() {
    const toggleBtn = document.getElementById('btn-mobile-menu-toggle');
    const closeBtn = document.getElementById('btn-mobile-menu-close');
    const drawer = document.getElementById('mobile-nav-drawer');
    const overlay = document.getElementById('mobile-nav-overlay');

    function open() {
      if (!drawer || !overlay) return;
      drawer.classList.add('is-open');
      overlay.classList.add('is-open');
      drawer.inert = false;
      drawer.setAttribute('aria-hidden', 'false');
      toggleBtn?.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      closeBtn?.focus();
    }

    function close(restoreFocus = true) {
      if (!drawer || !overlay) return;
      drawer.classList.remove('is-open');
      overlay.classList.remove('is-open');
      drawer.inert = true;
      drawer.setAttribute('aria-hidden', 'true');
      toggleBtn?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (restoreFocus && toggleBtn?.getClientRects().length) toggleBtn.focus();
    }

    toggleBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', () => close(true));
    overlay?.addEventListener('click', () => close(true));

    // Um único listener em captura controla o ciclo completo do foco.
    window.addEventListener('keydown', event => {
      if (!drawer?.classList.contains('is-open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
        return;
      }
      if (event.key !== 'Tab') return;

      const links = [...drawer.querySelectorAll('.mobile-nav-links a[href]')];
      const first = closeBtn || links[0];
      const last = links[links.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (event.target === first || active === first)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        last?.focus();
      } else if (!event.shiftKey && (event.target === last || active === last)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        first?.focus();
      }
    }, true);

    // Fallback para concluir o Shift+Tab em ambientes que não finalizam o foco no keydown.
    window.addEventListener('keyup', event => {
      if (event.key !== 'Tab' || !event.shiftKey || !drawer?.classList.contains('is-open')) return;
      if (document.activeElement !== closeBtn) return;
      const links = drawer.querySelectorAll('.mobile-nav-links a[href]');
      links[links.length - 1]?.focus();
    }, true);
  }

  function closeMobileMenu() {
    const drawer = document.getElementById('mobile-nav-drawer');
    const overlay = document.getElementById('mobile-nav-overlay');
    const toggleBtn = document.getElementById('btn-mobile-menu-toggle');
    drawer?.classList.remove('is-open');
    overlay?.classList.remove('is-open');
    if (drawer) {
      drawer.inert = true;
      drawer.setAttribute('aria-hidden', 'true');
    }
    toggleBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (toggleBtn?.getClientRects().length) toggleBtn.focus();
  }

  function navigateTo(hash) {
    window.location.hash = hash;
  }

  return {
    init,
    navigateTo,
    closeMobileMenu,
    getCurrentRoute: () => currentRoute
  };
})();
