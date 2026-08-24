/**
 * CHRONUS — Hash Router & View Switcher
 * Gerencia navegação SPA sem recarga e sem dependência de rotas no servidor.
 */
window.ChronusRouter = (function() {
  const routes = {
    '#/home': { viewId: 'view-home', title: 'Início · CHRONUS' },
    '#/player': { viewId: 'view-player', title: 'Minha Área · CHRONUS', authRequired: true },
    '#/narrator': { viewId: 'view-narrator', title: 'Painel do Narrador · CHRONUS', narratorOnly: true },
    '#/sheet': { viewId: 'view-sheet', title: 'Ficha Digital · CHRONUS' },
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

    // Checagem de Proteção de Rota
    const user = window.ChronusAuth?.getUser();
    const profile = window.ChronusAuth?.getProfile();

    if (routeDef.authRequired && !user) {
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

    // Se for rota de dashboard, recarrega dados atualizados
    if (cleanHash === '#/player') {
      window.ChronusPlayerDashboard?.load();
    } else if (cleanHash === '#/narrator') {
      window.ChronusNarratorPanel?.load();
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

    toggleBtn?.addEventListener('click', () => {
      drawer?.classList.add('is-open');
      overlay?.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });

    function close() {
      drawer?.classList.remove('is-open');
      overlay?.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', close);
  }

  function closeMobileMenu() {
    const drawer = document.getElementById('mobile-nav-drawer');
    const overlay = document.getElementById('mobile-nav-overlay');
    drawer?.classList.remove('is-open');
    overlay?.classList.remove('is-open');
    document.body.style.overflow = '';
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
