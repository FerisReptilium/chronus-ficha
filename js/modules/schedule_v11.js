/**
 * CHRONUS v1.1 — Scheduled Publication UI
 * Adiciona agendamento futuro sem cron: published_at futuro + RLS no servidor.
 */
(function installChronusScheduleUIV11() {
  'use strict';

  let observer = null;
  let busy = false;

  const LOADERS = Object.freeze({
    chapter: () => window.ChronusContent.getChapters({ limit: 250 }),
    session: () => window.ChronusContent.getSessions({ limit: 250 }),
    npc: () => window.ChronusContent.getNpcs({ limit: 250 }),
    location: () => window.ChronusContent.getLocations({ limit: 250 }),
    document: () => window.ChronusContent.getDocuments({ limit: 250 }),
    library: () => window.ChronusContent.getLibraryItems({ limit: 250 }),
    soundtrack: () => window.ChronusContent.getSoundtrack({ limit: 250 })
  });

  function isNarrator() {
    return window.location.hash.startsWith('#/narrator')
      && window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function parseCard(card) {
    const match = /^card-(chapter|session|npc|location|document|library|soundtrack)-([0-9a-f-]{36})$/i.exec(card?.id || '');
    return match ? { entity: match[1], id: match[2] } : null;
  }

  async function loadItem(entity, id) {
    const loader = LOADERS[entity];
    if (!loader) return null;
    try {
      const rows = await loader();
      return (rows || []).find(row => row.id === id) || null;
    } catch (_) {
      return null;
    }
  }

  function ensureStyle() {
    if (document.getElementById('chronus-v11-schedule-style')) return;
    const style = document.createElement('style');
    style.id = 'chronus-v11-schedule-style';
    style.textContent = `
      .btn-schedule-editorial { border-color:rgba(165,125,45,.7)!important; color:#f1d69a!important; }
      .btn-schedule-editorial:hover:not(:disabled) { background:rgba(103,75,21,.26)!important; }
      .badge-scheduled-v11 { background:rgba(118,87,24,.25)!important; border-color:rgba(196,151,60,.55)!important; color:#f1d69a!important; }
      .v11-schedule-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(5,4,2,.86); }
      .v11-schedule-card { width:min(540px,100%); padding:22px; border-radius:10px; background:var(--bg-card,#17120f); border:1px solid rgba(165,125,45,.7); }
      .v11-schedule-card h3 { margin-top:0; color:#f1d69a; }
      .v11-schedule-card input { width:100%; box-sizing:border-box; padding:10px; border-radius:6px; border:1px solid rgba(165,125,45,.45); background:rgba(0,0,0,.25); color:#f7edd8; }
      .v11-schedule-note { color:#b9aa8e; line-height:1.5; }
      .v11-schedule-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-wrap:wrap; }
      .v11-schedule-error { margin-top:12px; padding:9px; border:1px solid rgba(190,60,60,.5); color:#ffd2cc; border-radius:6px; }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.querySelector('.v11-schedule-modal')?.remove();
  }

  function defaultLocalDateTime() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toLocalInputValue(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function cancelSchedule(identity, title) {
    if (busy) return;
    if (!window.confirm(`Cancelar o agendamento de “${title}” e voltar o registro para rascunho?`)) return;
    busy = true;
    try {
      const result = await window.ChronusScheduleV11.cancelSchedule(identity.entity, identity.id);
      if (!result?.ok) {
        window.alert(result?.message || 'Não foi possível cancelar o agendamento.');
        return;
      }
      closeModal();
      window.alert('Agendamento cancelado. O conteúdo voltou para rascunho.');
      await window.ChronusNarratorPanel?.load?.();
    } finally {
      busy = false;
    }
  }

  async function openSchedule(identity, title) {
    if (!window.ChronusScheduleV11) {
      window.alert('Serviço de agendamento indisponível. Atualize a página.');
      return;
    }

    const currentItem = await loadItem(identity.entity, identity.id);
    const currentIso = currentItem?.published_at || null;
    const scheduled = Boolean(currentItem?.published === true && currentIso && Date.parse(currentIso) > Date.now());

    ensureStyle();
    const modal = document.createElement('div');
    modal.className = 'v11-schedule-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const card = document.createElement('div');
    card.className = 'v11-schedule-card';
    const h3 = document.createElement('h3');
    h3.textContent = `⏰ Agendar publicação — ${title}`;
    const note = document.createElement('p');
    note.className = 'v11-schedule-note';
    note.textContent = scheduled
      ? `Este conteúdo está agendado para ${new Date(currentIso).toLocaleString('pt-BR')}. Você pode alterar a data ou cancelar o agendamento.`
      : 'O conteúdo continuará invisível para jogadores e público até o horário escolhido. A liberação é controlada pelo Supabase/RLS e não depende do navegador permanecer aberto.';
    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.required = true;
    input.value = scheduled ? toLocalInputValue(currentIso) : defaultLocalDateTime();
    const error = document.createElement('div');
    error.className = 'v11-schedule-error';
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'v11-schedule-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'portal-btn portal-btn-secondary';
    close.textContent = 'Fechar';
    close.addEventListener('click', closeModal);
    if (scheduled) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'portal-btn portal-btn-secondary';
      cancel.textContent = '✕ Cancelar Agenda';
      cancel.addEventListener('click', () => cancelSchedule(identity, title));
      actions.appendChild(cancel);
    }
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'portal-btn portal-btn-gold';
    save.textContent = scheduled ? '⏰ Reagendar' : '⏰ Agendar';
    actions.append(close, save);
    card.append(h3, note, input, error, actions);
    modal.appendChild(card);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);

    save.addEventListener('click', async () => {
      if (busy) return;
      const localValue = input.value;
      const date = new Date(localValue);
      if (!localValue || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() + 30000) {
        error.textContent = 'Escolha uma data e hora futuras.';
        error.hidden = false;
        return;
      }
      busy = true;
      save.disabled = true;
      close.disabled = true;
      save.textContent = 'Agendando…';
      try {
        const result = await window.ChronusScheduleV11.schedulePublication(identity.entity, identity.id, date.toISOString());
        if (!result?.ok) {
          error.textContent = result?.message || 'Não foi possível criar o agendamento.';
          error.hidden = false;
          return;
        }
        closeModal();
        window.alert(`Publicação agendada para ${date.toLocaleString('pt-BR')}.`);
        await window.ChronusNarratorPanel?.load?.();
      } finally {
        busy = false;
        if (document.body.contains(save)) {
          save.disabled = false;
          close.disabled = false;
          save.textContent = scheduled ? '⏰ Reagendar' : '⏰ Agendar';
        }
      }
    });
  }

  async function decorateScheduledCard(card, identity) {
    const item = await loadItem(identity.entity, identity.id);
    if (!document.body.contains(card)) return;
    const iso = item?.published_at || null;
    const scheduled = Boolean(item?.published === true && iso && Date.parse(iso) > Date.now());
    if (!scheduled) return;
    const badge = card.querySelector('.badge-pub-status');
    if (badge) {
      badge.className = 'editorial-badge badge-pub-status badge-scheduled-v11';
      badge.textContent = `⏰ Agendado: ${new Date(iso).toLocaleString('pt-BR')}`;
    }
  }

  function enhance() {
    if (!isNarrator()) return;
    document.querySelectorAll('.editorial-item-card').forEach(card => {
      if (card.dataset.v11ScheduleEnhanced === 'true') return;
      const identity = parseCard(card);
      if (!identity) return;
      const controls = card.querySelector('.editorial-item-controls');
      if (!controls) return;
      card.dataset.v11ScheduleEnhanced = 'true';
      const title = (card.querySelector('.editorial-item-title')?.textContent || 'Sem título').trim();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'portal-btn portal-btn-secondary btn-schedule-editorial';
      button.textContent = '⏰ Agendar';
      button.setAttribute('aria-label', `Agendar publicação de ${title}`);
      button.addEventListener('click', () => openSchedule(identity, title));
      controls.appendChild(button);
      decorateScheduledCard(card, identity);
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
