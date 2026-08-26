/**
 * CHRONUS v1.1 — Scheduled Publication UI
 * Adiciona agendamento futuro sem cron: published_at futuro + RLS no servidor.
 */
(function installChronusScheduleUIV11() {
  'use strict';

  let observer = null;
  let busy = false;

  function isNarrator() {
    return window.location.hash.startsWith('#/narrator')
      && window.ChronusAuth?.getProfile?.()?.role === 'narrator';
  }

  function parseCard(card) {
    const match = /^card-(chapter|session|npc|location|document|library|soundtrack)-([0-9a-f-]{36})$/i.exec(card?.id || '');
    return match ? { entity: match[1], id: match[2] } : null;
  }

  function findItem(entity, id) {
    const cache = window.ChronusNarratorPanelV11Cache?.get?.(entity);
    if (Array.isArray(cache)) return cache.find(item => item.id === id) || null;
    return null;
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

  function cardPublishedAt(card) {
    const raw = card.dataset.publishedAtV11;
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }

  function closeModal() {
    document.querySelector('.v11-schedule-modal')?.remove();
  }

  function defaultLocalDateTime() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function openSchedule(identity, title, currentIso) {
    if (!window.ChronusScheduleV11) {
      window.alert('Serviço de agendamento indisponível. Atualize a página.');
      return;
    }
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
    note.textContent = 'O conteúdo ficará marcado como publicado, mas continuará invisível para jogadores e público até o horário escolhido. A liberação é controlada pelo Supabase/RLS e não depende do navegador permanecer aberto.';
    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.required = true;
    if (currentIso && Date.parse(currentIso) > Date.now()) {
      const d = new Date(currentIso);
      const pad = n => String(n).padStart(2, '0');
      input.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
      input.value = defaultLocalDateTime();
    }
    const error = document.createElement('div');
    error.className = 'v11-schedule-error';
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'v11-schedule-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'portal-btn portal-btn-secondary';
    cancel.textContent = 'Fechar';
    cancel.addEventListener('click', closeModal);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'portal-btn portal-btn-gold';
    save.textContent = '⏰ Agendar';
    actions.append(cancel, save);
    card.append(h3, note, input, error, actions);
    modal.appendChild(card);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);

    save.addEventListener('click', async () => {
      if (busy) return;
      const localValue = input.value;
      if (!localValue) {
        error.textContent = 'Informe data e hora.';
        error.hidden = false;
        return;
      }
      const date = new Date(localValue);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() + 30000) {
        error.textContent = 'Escolha uma data futura.';
        error.hidden = false;
        return;
      }
      busy = true;
      save.disabled = true;
      cancel.disabled = true;
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
          cancel.disabled = false;
          save.textContent = '⏰ Agendar';
        }
      }
    });
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
      window.alert('Agendamento cancelado. O conteúdo voltou para rascunho.');
      await window.ChronusNarratorPanel?.load?.();
    } finally {
      busy = false;
    }
  }

  function enhance() {
    if (!isNarrator()) return;
    document.querySelectorAll('.editorial-item-card').forEach(card => {
      if (card.dataset.v11ScheduleEnhanced === 'true') return;
      const identity = parseCard(card);
      if (!identity) return;
      const controls = card.querySelector('.editorial-item-controls');
      const badges = card.querySelector('.editorial-item-badges');
      if (!controls) return;
      card.dataset.v11ScheduleEnhanced = 'true';
      const title = (card.querySelector('.editorial-item-title')?.textContent || 'Sem título').trim();

      const item = findItem(identity.entity, identity.id);
      const publishedAt = item?.published_at || null;
      card.dataset.publishedAtV11 = publishedAt || '';
      const scheduled = Boolean(item?.published === true && publishedAt && Date.parse(publishedAt) > Date.now());

      if (scheduled && badges) {
        const pubBadge = badges.querySelector('.badge-pub-status');
        if (pubBadge) {
          pubBadge.className = 'editorial-badge badge-pub-status badge-scheduled-v11';
          pubBadge.textContent = `⏰ Agendado: ${new Date(publishedAt).toLocaleString('pt-BR')}`;
        }
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'portal-btn portal-btn-secondary btn-schedule-editorial';
      button.textContent = scheduled ? '✕ Cancelar Agenda' : '⏰ Agendar';
      button.setAttribute('aria-label', scheduled ? `Cancelar agendamento de ${title}` : `Agendar publicação de ${title}`);
      if (scheduled) button.addEventListener('click', () => cancelSchedule(identity, title));
      else button.addEventListener('click', () => openSchedule(identity, title, publishedAt));
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
