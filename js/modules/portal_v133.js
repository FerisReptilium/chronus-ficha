/**
 * CHRONUS v1.3.3 — continuidade editorial das páginas internas.
 *
 * Decora somente as oito views públicas do portal. Autenticação, RLS, ficha,
 * painel do jogador e painel do Narrador permanecem fora desta camada.
 */
window.ChronusPortalV133 = (function() {
  'use strict';

  const STYLE_HREF = 'css/portal-v133.css';
  const PAGES = [
    ['view-chronicle', '01 / Crônica ativa', 'REGISTRO NARRATIVO · BERLIM 1990'],
    ['view-sessions', '02 / Diário de campo', 'CRONOLOGIA · ACESSO CONFORME PERFIL'],
    ['view-npcs', '03 / Dossiês humanos', 'PESSOAS DE INTERESSE · K-17'],
    ['view-maps', '04 / Atlas operacional', 'CARTOGRAFIA · TERRITÓRIOS RECONHECIDOS'],
    ['view-files', '05 / Evidências', 'ARQUIVO CONFISCADO · ACESSO CONTROLADO'],
    ['view-soundtrack', '06 / Paisagem sonora', 'ARQUIVO ANALÓGICO · BERLIM 1990'],
    ['view-system', '07 / Fundamentos', 'PROTOCOLO DE AÇÃO · REALIDADE E RISCO'],
    ['view-library', '08 / Acervo oficial', 'DOCUMENTAÇÃO · ACESSO CONFORME PERFIL']
  ];

  function ensureStylesheet() {
    if (document.querySelector('link[data-chronus-v133="portal-polish"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.chronusV133 = 'portal-polish';
    document.head.appendChild(link);
  }

  function decoratePage([viewId, contextText, stampText]) {
    const view = document.getElementById(viewId);
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return false;

    view.classList.add('portal-internal-v133');
    head.dataset.v133Stamp = stampText;

    let context = head.querySelector('[class*="-page-context-v13"], .v133-hero-context');
    if (!context) {
      context = document.createElement('span');
      head.insertBefore(context, head.firstChild);
    }
    context.classList.add('v133-hero-context');
    context.textContent = contextText;
    return true;
  }

  function init() {
    ensureStylesheet();
    const decorated = PAGES.filter(decoratePage).length;
    document.documentElement.dataset.chronusPortal = 'v1.3.3-preview';
    return decorated === PAGES.length;
  }

  return { init };
})();
