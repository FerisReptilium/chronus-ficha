/**
 * CHRONUS v1.1 — Editorial Relations UI
 * Editor visual das junction tables tipadas para Capítulos, Sessões e NPCs.
 */
(function installChronusRelationsUIV11() {
  'use strict';

  const OWNER_RELATIONS = Object.freeze({
    session: Object.freeze([
      ['session_npcs', 'NPCs da Sessão'],
      ['session_locations', 'Locais da Sessão'],
      ['session_documents', 'Documentos da Sessão']
    ]),
    chapter: Object.freeze([
      ['chapter_npcs', 'NPCs do Capítulo'],
      ['chapter_locations', 'Locais do Capítulo']
    ]),
    npc: Object.freeze([
      ['npc_locations', 'Locais associados ao NPC'],
      ['npc_documents', 'Documentos associados ao NPC']
    ])
  });

  const TARGET_LOADERS = Object.freeze({
    npc: () => window.ChronusContent.getNpcs({ limit: 250 }),
    location: () => window.ChronusContent.getLocations({ limit: 250 }),
    document: () => window.ChronusContent.getDocuments({ limit: 250 })
  });

  let observer = null;
  let busy = false;

  function isNarrator() {
    return window.location.hash.startsWith('#/narrator')
      && window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function parseCard(card) {
    const match = /^card-(chapter|session|npc)-([0-9a-f-]{36})$/i.exec(card?.id || '');
    return match ? { entity: match[1], id: match[2] } : null;
  }

  function titleForTarget(entity, item) {
    if (entity === 'npc') return item.name || 'NPC sem nome';
    if (entity === 'location') return item.name || 'Local sem nome';
    if (entity === 'document') return item.title || 'Documento sem título';
    return item.title || item.name || 'Registro';
  }

  function metadataLabel(field) {
    if (field === 'role_in_session') return 'Papel na sessão';
    if (field === 'notes') return 'Notas';
    if (field === 'discovery_context') return 'Contexto da descoberta';
    if (field === 'association_type') return 'Tipo de associação';
    return 'Detalhe';
  }

  function ensureStyle() {
    if (document.getElementById('chronus-v11-relations-style')) return;
    const style = document.createElement('style');
    style.id = 'chronus-v11-relations-style';
    style.textContent = `
      .btn-relations-editorial { border-color:rgba(57,125,141,.72)!important; color:#bfe8ef!important; }
      .btn-relations-editorial:hover:not(:disabled) { background:rgba(30,81,92,.28)!important; }
      .v11-rel-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(3,7,8,.86); }
      .v11-rel-card { width:min(900px,100%); max-height:90vh; overflow:auto; padding:22px; border-radius:10px; background:var(--bg-card,#17120f); border:1px solid rgba(57,125,141,.72); }
      .v11-rel-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:16px; }
      .v11-rel-head h3 { margin:0; color:#bfe8ef; }
      .v11-rel-section { border-top:1px solid rgba(57,125,141,.25); padding-top:14px; margin-top:14px; }
      .v11-rel-section h4 { margin:0 0 10px; color:#d6edf1; }
      .v11-rel-list { display:grid; gap:8px; }
      .v11-rel-row { display:grid; grid-template-columns:minmax(180px,1fr) minmax(180px,1fr); gap:10px; align-items:center; padding:9px 10px; border:1px solid rgba(255,255,255,.08); border-radius:6px; }
      .v11-rel-check { display:flex; align-items:center; gap:8px; }
      .v11-rel-meta { width:100%; box-sizing:border-box; padding:8px; border-radius:5px; border:1px solid rgba(57,125,141,.35); background:rgba(0,0,0,.25); color:#edf7f8; }
      .v11-rel-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
      .v11-rel-error { margin-top:12px; padding:10px; border:1px solid rgba(190,60,60,.5); color:#ffd2cc; border-radius:6px; }
      @media (max-width:680px) { .v11-rel-row { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.querySelector('.v11-rel-modal')?.remove();
  }

  async function loadTargetOptions(entity) {
    const loader = TARGET_LOADERS[entity];
    if (!loader) return [];
    try { return await loader(); } catch (_) { return []; }
  }

  async function openRelations(identity, title) {
    if (busy) return;
    if (!window.ChronusRelationsV11) {
      window.alert('Serviço de relações indisponível. Atualize a página.');
      return;
    }

    const relations = OWNER_RELATIONS[identity.entity] || [];
    if (!relations.length) return;
    busy = true;

    try {
      const loaded = [];
      for (const [relationKey, relationLabel] of relations) {
        const cfg = window.ChronusRelationsV11.config[relationKey];
        const [existingRes, targets] = await Promise.all([
          window.ChronusRelationsV11.getRelations(relationKey, identity.id),
          loadTargetOptions(cfg.targetEntity)
        ]);
        if (!existingRes?.ok) {
          window.alert(existingRes?.message || `Falha ao carregar ${relationLabel}.`);
          return;
        }
        loaded.push({ relationKey, relationLabel, cfg, existing: existingRes.data || [], targets: targets || [] });
      }

      ensureStyle();
      const modal = document.createElement('div');
      modal.className = 'v11-rel-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const card = document.createElement('div');
      card.className = 'v11-rel-card';
      const head = document.createElement('div');
      head.className = 'v11-rel-head';
      const h3 = document.createElement('h3');
      h3.textContent = `🔗 Relações — ${title}`;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'portal-btn portal-btn-secondary';
      close.textContent = 'Fechar';
      close.addEventListener('click', closeModal);
      head.append(h3, close);
      card.appendChild(head);

      const form = document.createElement('form');
      const collectors = [];

      loaded.forEach(block => {
        const section = document.createElement('section');
        section.className = 'v11-rel-section';
        const h4 = document.createElement('h4');
        h4.textContent = block.relationLabel;
        section.appendChild(h4);
        const list = document.createElement('div');
        list.className = 'v11-rel-list';
        const existingMap = new Map(block.existing.map(row => [row.target_id, row.metadata || '']));
        const rows = [];

        if (block.targets.length === 0) {
          const empty = document.createElement('p');
          empty.textContent = 'Nenhum registro disponível para relacionar.';
          list.appendChild(empty);
        }

        block.targets.forEach(item => {
          const row = document.createElement('div');
          row.className = 'v11-rel-row';
          const checkWrap = document.createElement('label');
          checkWrap.className = 'v11-rel-check';
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.checked = existingMap.has(item.id);
          const name = document.createElement('span');
          name.textContent = titleForTarget(block.cfg.targetEntity, item);
          checkWrap.append(check, name);
          row.appendChild(checkWrap);

          let meta = null;
          if (block.cfg.metadata) {
            meta = document.createElement('input');
            meta.type = 'text';
            meta.className = 'v11-rel-meta';
            meta.placeholder = metadataLabel(block.cfg.metadata);
            meta.value = existingMap.get(item.id) || '';
            row.appendChild(meta);
          } else {
            const spacer = document.createElement('span');
            spacer.textContent = check.checked ? 'Vinculado' : '—';
            row.appendChild(spacer);
          }

          rows.push({ targetId: item.id, check, meta });
          list.appendChild(row);
        });

        collectors.push({ relationKey: block.relationKey, rows });
        section.appendChild(list);
        form.appendChild(section);
      });

      const error = document.createElement('div');
      error.className = 'v11-rel-error';
      error.hidden = true;
      form.appendChild(error);
      const actions = document.createElement('div');
      actions.className = 'v11-rel-actions';
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'portal-btn portal-btn-gold';
      save.textContent = '💾 Salvar Relações';
      actions.appendChild(save);
      form.appendChild(actions);

      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        busy = true;
        save.disabled = true;
        save.textContent = 'Salvando…';
        error.hidden = true;
        try {
          for (const collector of collectors) {
            const rows = collector.rows
              .filter(row => row.check.checked)
              .map(row => ({ target_id: row.targetId, metadata: row.meta ? row.meta.value : null }));
            const result = await window.ChronusRelationsV11.saveRelations(collector.relationKey, identity.id, rows);
            if (!result?.ok) {
              error.textContent = result?.message || 'Falha ao salvar uma das relações.';
              error.hidden = false;
              return;
            }
          }
          closeModal();
          window.alert('Relações salvas com sucesso.');
        } finally {
          busy = false;
          if (document.body.contains(save)) {
            save.disabled = false;
            save.textContent = '💾 Salvar Relações';
          }
        }
      });

      card.appendChild(form);
      modal.appendChild(card);
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
      document.body.appendChild(modal);
    } finally {
      busy = false;
    }
  }

  function enhance() {
    if (!isNarrator()) return;
    document.querySelectorAll('.editorial-item-card').forEach(card => {
      if (card.dataset.v11RelationsEnhanced === 'true') return;
      const identity = parseCard(card);
      if (!identity) return;
      const controls = card.querySelector('.editorial-item-controls');
      if (!controls) return;
      card.dataset.v11RelationsEnhanced = 'true';
      const title = (card.querySelector('.editorial-item-title')?.textContent || 'Sem título').trim();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'portal-btn portal-btn-secondary btn-relations-editorial';
      button.textContent = '🔗 Relações';
      button.setAttribute('aria-label', `Editar relações de ${title}`);
      button.addEventListener('click', () => openRelations(identity, title));
      controls.appendChild(button);
    });
  }

  function installObserver() {
    const root = document.getElementById('narrator-panel-container');
    if (!root || observer) return;
    observer = new MutationObserver(() => queueMicrotask(enhance));
    observer.observe(root, { childList: true, subtree: true });
    enhance();
  }

  ensureStyle();
  installObserver();
})();
