/** CHRONUS v1.1 — mobile containment for Narrator/CMS extensions. */
(function installChronusResponsiveV11(){
  'use strict';
  if(document.getElementById('chronus-v11-responsive-style')) return;
  const style=document.createElement('style');
  style.id='chronus-v11-responsive-style';
  style.textContent=`
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
