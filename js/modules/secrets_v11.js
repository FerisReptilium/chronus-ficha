/**
 * CHRONUS v1.1 — Narrator Secrets UI
 * Adiciona editor modal de segredos às entidades suportadas.
 */
(function installChronusSecretsUIV11() {
  'use strict';

  const LABELS = Object.freeze({
    chapter: Object.freeze({ narrator_notes: 'Notas do Narrador', hidden_truth: 'Verdade Oculta', future_reveals: 'Revelações Futuras' }),
    session: Object.freeze({ narrator_notes: 'Notas do Narrador', hidden_events: 'Eventos Ocultos', consequences: 'Consequências', future_hooks: 'Ganchos Futuros' }),
    npc: Object.freeze({ true_identity: 'Identidade Verdadeira', true_faction: 'Facção Verdadeira', agenda: 'Agenda', secrets: 'Segredos', narrator_notes: 'Notas do Narrador', hidden_status: 'Status Oculto' }),
    location: Object.freeze({ narrator_notes: 'Notas do Narrador', hidden_features: 'Características Ocultas', supernatural_truth: 'Verdade Sobrenatural' }),
    document: Object.freeze({ narrator_notes: 'Notas do Narrador', hidden_meaning: 'Significado Oculto', solution_translation: 'Solução / Tradução' })
  });

  let observer;
  let busy = false;

  function isNarrator() {
    return window.location.hash.startsWith('#/narrator')
      && window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function parseCard(card) {
    const match = /^card-(chapter|session|npc|location|document)-([0-9a-f-]{36})$/i.exec(card?.id || '');
    return match ? { entity: match[1], id: match[2] } : null;
  }

  function ensureStyle() {
    if (document.getElementById('chronus-v11-secrets-style')) return;
    const style = document.createElement('style');
    style.id = 'chronus-v11-secrets-style';
    style.textContent = `
      .btn-secret-editorial { border-color: rgba(118,83,160,.75)!important; color:#d8c5f1!important; }
      .btn-secret-editorial:hover:not(:disabled) { background:rgba(74,43,105,.28)!important; }
      .v11-secret-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(4,3,6,.86); }
      .v11-secret-card { width:min(760px,100%); max-height:90vh; overflow:auto; padding:22px; border-radius:10px; background:var(--bg-card,#17120f); border:1px solid rgba(118,83,160,.75); }
      .v11-secret-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:15px; }
      .v11-secret-head h3 { margin:0; color:#d8c5f1; }
      .v11-secret-warning { margin:6px 0 0; color:#b7a9c9; font-size:.9rem; }
      .v11-secret-grid { display:grid; gap:12px; }
      .v11-secret-field { display:grid; gap:6px; }
      .v11-secret-field label { color:#d6ccdf; font-weight:600; }
      .v11-secret-field textarea { min-height:92px; resize:vertical; padding:10px; border-radius:6px; border:1px solid rgba(118,83,160,.45); background:rgba(0,0,0,.28); color:#f1eaf7; }
      .v11-secret-actions { display:flex; justify-content:space-between; gap:10px; margin-top:16px; flex-wrap:wrap; }
      .v11-secret-error { margin-top:12px; padding:10px; border:1px solid rgba(190,60,60,.5); color:#ffd2cc; border-radius:6px; }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.querySelector('.v11-secret-modal')?.remove();
  }

  async function openSecretModal(identity, title) {
    if (busy) return;
    if (!window.ChronusSecretsV11) {
      window.alert('Serviço de Segredos indisponível. Atualize a página.');
      return;
    }

    busy = true;
    let current = null;
    try {
      const result = await window.ChronusSecretsV11.getSecret(identity.entity, identity.id);
      if (!result?.ok) {
        window.alert(result?.message || 'Não foi possível carregar os segredos.');
        return;
      }
      current = result.data || {};
    } finally {
      busy = false;
    }

    ensureStyle();
    const modal = document.createElement('div');
    modal.className = 'v11-secret-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'v11-secret-card';
    const head = document.createElement('div');
    head.className = 'v11-secret-head';
    const headText = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = `🔐 Segredos — ${title}`;
    const warning = document.createElement('p');
    warning.className = 'v11-secret-warning';
    warning.textContent = 'Conteúdo exclusivo do Narrador. Nunca é exibido nas áreas públicas ou dos jogadores.';
    headText.append(h3, warning);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'portal-btn portal-btn-secondary';
    close.textContent = 'Fechar';
    close.addEventListener('click', closeModal);
    head.append(headText, close);
    card.appendChild(head);

    const form = document.createElement('form');
    const grid = document.createElement('div');
    grid.className = 'v11-secret-grid';
    const fields = LABELS[identity.entity] || {};
    const inputs = {};

    Object.entries(fields).forEach(([name, label]) => {
      const group = document.createElement('div');
      group.className = 'v11-secret-field';
      const lbl = document.createElement('label');
      lbl.textContent = label;
      const textarea = document.createElement('textarea');
      textarea.value = current?.[name] || '';
      textarea.name = name;
      inputs[name] = textarea;
      group.append(lbl, textarea);
      grid.appendChild(group);
    });
    form.appendChild(grid);

    const error = document.createElement('div');
    error.className = 'v11-secret-error';
    error.hidden = true;
    form.appendChild(error);

    const actions = document.createElement('div');
    actions.className = 'v11-secret-actions';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'portal-btn portal-btn-secondary';
    clear.textContent = 'Apagar bloco de segredos';
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'portal-btn portal-btn-gold';
    save.textContent = '💾 Salvar Segredos';
    actions.append(clear, save);
    form.appendChild(actions);

    clear.addEventListener('click', async () => {
      if (!window.confirm('Deseja apagar todo o bloco privado de segredos deste registro?')) return;
      clear.disabled = true;
      save.disabled = true;
      const result = await window.ChronusSecretsV11.clearSecret(identity.entity, identity.id);
      clear.disabled = false;
      save.disabled = false;
      if (!result?.ok) {
        error.textContent = result?.message || 'Não foi possível apagar os segredos.';
        error.hidden = false;
        return;
      }
      closeModal();
      window.alert('Bloco de segredos removido.');
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      error.hidden = true;
      const payload = {};
      Object.entries(inputs).forEach(([name, input]) => { payload[name] = input.value; });
      busy = true;
      save.disabled = true;
      clear.disabled = true;
      save.textContent = 'Salvando…';
      try {
        const result = await window.ChronusSecretsV11.saveSecret(identity.entity, identity.id, payload);
        if (!result?.ok) {
          error.textContent = result?.message || 'Não foi possível salvar os segredos.';
          error.hidden = false;
          return;
        }
        closeModal();
        window.alert('Segredos salvos com segurança.');
      } finally {
        busy = false;
        if (document.body.contains(save)) {
          save.disabled = false;
          clear.disabled = false;
          save.textContent = '💾 Salvar Segredos';
        }
      }
    });

    card.appendChild(form);
    modal.appendChild(card);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  function enhance() {
    if (!isNarrator()) return;
    document.querySelectorAll('.editorial-item-card').forEach(card => {
      if (card.dataset.v11SecretsEnhanced === 'true') return;
      const identity = parseCard(card);
      if (!identity) return;
      const controls = card.querySelector('.editorial-item-controls');
      if (!controls) return;
      card.dataset.v11SecretsEnhanced = 'true';
      const title = (card.querySelector('.editorial-item-title')?.textContent || 'Sem título').trim();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'portal-btn portal-btn-secondary btn-secret-editorial';
      button.textContent = '🔐 Segredos';
      button.setAttribute('aria-label', `Editar segredos de ${title}`);
      button.addEventListener('click', () => openSecretModal(identity, title));
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
