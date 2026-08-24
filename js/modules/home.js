/**
 * CHRONUS — Home Page Module
 * Renderização e interatividade da página inicial cinematográfica.
 */
window.ChronusHome = (function() {
  function init() {
    setupHeroCta();
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
