/**
 * CHRONUS v1.1 — Narrator DELETE Controls
 * Extensão visual não invasiva: adiciona exclusão definitiva aos cards do CMS
 * sem alterar o motor legado do Narrator Panel v1.0.
 */
(function installChronusNarratorV11() {
  'use strict';

  const panel = window.ChronusNarratorPanel;
  if (!panel || typeof panel.load !== 'function') {
    console.error('CHRONUS v1.1: Narrator Panel indisponível; controles DELETE não instalados.');
    return;
  }

  if (!window.ChronusEditorial || typeof window.ChronusEditorial.deleteContent !== 'function') {
    console.error('CHRONUS v1.1: deleteContent indisponível; controles DELETE não instalados.');
    return;
  }

  const ENTITY_LABELS = Object.freeze({
    chapter: 'capítulo',
    session: 'sessão',
    npc: 'NPC',
    location: 'local',
    document: 'documento',
    library: 'item da biblioteca',
    soundtrack: 'trilha sonora'
  });

  let observer = null;
  let observerRoot = null;
  let enhancementQueued = false;
  let deleteInFlight = false;
  const originalLoad = panel.load.bind(panel);

  function isNarratorRoute() {
    return window.location.hash.startsWith('#/narrator')
      && window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function ensureDeleteStyle() {
    if (document.getElementById('chronus-v11-delete-style')) return;

    const style = document.createElement('style');
    style.id = 'chronus-v11-delete-style';
    style.textContent = `
      .btn-delete-editorial {
        border-color: rgba(170, 64, 64, .75) !important;
        color: #e8b0aa !important;
      }
      .btn-delete-editorial:hover:not(:disabled),
      .btn-delete-editorial:focus-visible:not(:disabled) {
        border-color: #d55f55 !important;
        background: rgba(110, 25, 25, .28) !important;
        color: #ffd8d3 !important;
      }
      .btn-delete-editorial:disabled {
        opacity: .55;
        cursor: wait;
      }
    `;
    document.head.appendChild(style);
  }

  function parseCardIdentity(card) {
    const raw = card?.id || '';
    const match = /^card-(chapter|session|npc|location|document|library|soundtrack)-([0-9a-f-]{36})$/i.exec(raw);
    if (!match) return null;
    return { entity: match[1], id: match[2] };
  }

  function scheduleEnhancement() {
    if (enhancementQueued) return;
    enhancementQueued = true;
    queueMicrotask(() => {
      enhancementQueued = false;
      enhanceDeleteButtons();
    });
  }

  function enhanceDeleteButtons() {
    if (!isNarratorRoute()) return;

    ensureDeleteStyle();

    document.querySelectorAll('.editorial-item-card').forEach(card => {
      if (card.dataset.v11DeleteEnhanced === 'true') return;

      const identity = parseCardIdentity(card);
      if (!identity) return;

      const controls = card.querySelector('.editorial-item-controls');
      if (!controls) return;

      card.dataset.v11DeleteEnhanced = 'true';

      const title = (card.querySelector('.editorial-item-title')?.textContent || 'Sem título').trim();
      const entityLabel = ENTITY_LABELS[identity.entity] || 'registro';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'portal-btn portal-btn-secondary btn-delete-editorial';
      button.textContent = '🗑 Excluir';
      button.setAttribute('aria-label', `Excluir definitivamente ${title}`);

      button.addEventListener('click', async () => {
        if (deleteInFlight) return;

        const firstConfirmation = window.confirm(
          `EXCLUSÃO DEFINITIVA\n\n` +
          `Você está prestes a excluir o ${entityLabel} “${title}”.\n\n` +
          `Esta ação remove o registro e suas relações dependentes. ` +
          `Arquivos vinculados serão removidos do Storage de forma segura.\n\n` +
          `Deseja continuar?`
        );

        if (!firstConfirmation) return;

        const typed = window.prompt(
          `Confirmação final para excluir “${title}”.\n\n` +
          `Digite exatamente EXCLUIR para confirmar:`
        );

        if (typed !== 'EXCLUIR') {
          window.alert('Exclusão cancelada. A palavra de confirmação não corresponde.');
          return;
        }

        deleteInFlight = true;
        button.disabled = true;
        const previousText = button.textContent;
        button.textContent = 'Excluindo…';

        const siblingControls = controls.querySelectorAll('button, select, input');
        siblingControls.forEach(el => {
          if (el !== button) el.disabled = true;
        });

        try {
          const result = await window.ChronusEditorial.deleteContent(
            identity.entity,
            identity.id,
            { confirmed: true }
          );

          if (!result?.ok) {
            window.alert(result?.message || 'Não foi possível excluir o registro.');
            return;
          }

          if (result.warning === 'ASSET_CLEANUP_PENDING') {
            const pending = result.data?.cleanup?.pending || 0;
            window.alert(
              `Registro excluído com sucesso.\n\n` +
              `${pending} asset(s) ficaram marcados para limpeza pendente. ` +
              `O catálogo foi preservado para auditoria e nova tentativa segura.`
            );
          } else {
            window.alert('Registro excluído definitivamente com sucesso.');
          }

          await window.ChronusNarratorPanel.load();
        } catch (error) {
          console.error('CHRONUS v1.1: falha inesperada no DELETE:', error);
          window.alert('Ocorreu uma falha inesperada durante a exclusão.');
        } finally {
          deleteInFlight = false;
          if (document.body.contains(button)) {
            button.disabled = false;
            button.textContent = previousText;
            siblingControls.forEach(el => {
              if (el !== button) el.disabled = false;
            });
          }
        }
      });

      controls.appendChild(button);
    });
  }

  function installObserver() {
    const root = document.getElementById('narrator-panel-container');
    if (!root) return;

    if (observer && observerRoot === root) {
      scheduleEnhancement();
      return;
    }

    if (observer) observer.disconnect();

    observerRoot = root;
    observer = new MutationObserver(() => scheduleEnhancement());
    observer.observe(root, { childList: true, subtree: true });
    scheduleEnhancement();
  }

  panel.load = async function chronusNarratorV11Load() {
    const result = await originalLoad();
    installObserver();
    return result;
  };

  installObserver();
})();
