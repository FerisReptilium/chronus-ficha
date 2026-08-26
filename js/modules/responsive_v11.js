/** CHRONUS v1.1 — mobile containment for Narrator/CMS extensions. */
(function installChronusResponsiveV11(){
  'use strict';
  if(document.getElementById('chronus-v11-responsive-style')) return;
  const style=document.createElement('style');
  style.id='chronus-v11-responsive-style';
  style.textContent=`
    /*
     * navigation.css hid the drawer with right:-320px. Although visually hidden,
     * Chromium still counted part of that fixed element in document overflow.
     * Keep the closed drawer inside the viewport and hide it semantically instead.
     */
    .mobile-nav-drawer {
      right: 0 !important;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease !important;
    }
    .mobile-nav-drawer.is-open {
      right: 0 !important;
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
    }

    /*
     * At the same breakpoint where the desktop navigation is replaced by the
     * hamburger, remove the duplicated desktop auth badge from the header.
     * Login/profile/logout remain available inside #mobile-nav-user-area.
     * This prevents long authenticated display names/role badges from widening
     * the mobile document while preserving all authentication actions.
     */
    @media (max-width: 1180px) {
      #nav-user-area {
        display: none !important;
      }
    }

    @media (max-width: 768px) {
      #view-narrator .portal-container,
      #narrator-panel-container,
      #narrator-panel-container .narrator-pane,
      #narrator-panel-container .editorial-toolbar,
      #narrator-panel-container .editorial-dashboard-grid,
      #narrator-panel-container .editorial-items-grid,
      #narrator-panel-container .editorial-item-card,
      #narrator-panel-container .editorial-form-card,
      #narrator-panel-container .editorial-slots-grid,
      #narrator-panel-container .asset-slot-card {
        min-width: 0 !important;
        max-width: 100% !important;
      }
      #narrator-panel-container .editorial-search-wrapper {
        min-width: 0 !important;
        width: 100% !important;
      }
      #narrator-panel-container .editorial-filter-pills,
      #narrator-panel-container .editorial-item-controls,
      #narrator-panel-container .editorial-item-badges,
      #narrator-panel-container .form-actions-row {
        min-width: 0 !important;
        max-width: 100% !important;
        flex-wrap: wrap !important;
      }
      #narrator-panel-container input,
      #narrator-panel-container select,
      #narrator-panel-container textarea,
      #narrator-panel-container button {
        max-width: 100%;
      }
      #narrator-panel-container .editorial-item-title,
      #narrator-panel-container .editorial-item-subtitle,
      #narrator-panel-container .editorial-item-desc,
      #narrator-panel-container .editorial-badge {
        overflow-wrap: anywhere;
      }
    }
  `;
  document.head.appendChild(style);
})();
