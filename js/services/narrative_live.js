/**
 * CHRONUS — Sincronização de rolagens com a Mesa do Narrador
 * Registra rolagens dos jogadores e transmite INSERTs autorizados via Realtime.
 * O banco aplica RLS; o cliente nunca define o nome público do jogador.
 */
(function(root) {
  'use strict';

  const OUTCOME_LABELS = {
    exceptional_success: 'Sucesso excepcional',
    success: 'Sucesso',
    partial_success: 'Sucesso parcial',
    failure: 'Falha',
    critical_failure: 'Falha crítica'
  };

  let channel = null;
  let mountedRoot = null;
  let feedGeneration = 0;
  const records = new Map();

  function client() {
    return root.ChronusSupabase?.getClient?.() || null;
  }

  function addRecord(record) {
    if (!record?.id) return;
    records.set(record.id, record);
    const ordered = [...records.values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20);
    records.clear();
    ordered.forEach(item => records.set(item.id, item));
    renderFeed();
  }

  function renderFeed() {
    if (!mountedRoot?.isConnected) return;
    const list = mountedRoot.querySelector('[data-roll-feed-list]');
    if (!list) return;
    list.replaceChildren();

    if (!records.size) {
      const item = document.createElement('li');
      item.className = 'chronus-live-roll-empty narrator-roll-feed-empty';
      item.textContent = 'Nenhuma rolagem compartilhada nesta sessão ainda.';
      list.appendChild(item);
      return;
    }

    [...records.values()].forEach(record => {
      const item = document.createElement('li');
      item.className = 'chronus-live-roll-event';
      const marker = document.createElement('span');
      marker.className = 'chronus-live-feed-marker';
      marker.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('div');
      const player = document.createElement('strong');
      player.textContent = record.player_display_name || 'Jogador';
      const title = document.createElement('p');
      title.textContent = [record.character_name, record.action_label].filter(Boolean).join(' — ');
      const dice = document.createElement('p');
      dice.className = 'chronus-live-roll-dice';
      dice.textContent = (record.dice || []).map(die =>
        'd' + die.sides + ': ' + die.value + (die.determination ? ' (Determinação)' : '')
      ).join(' · ');
      const result = document.createElement('strong');
      result.className = 'chronus-live-roll-result';
      result.textContent = (OUTCOME_LABELS[record.outcome] || record.outcome) +
        ' · Maior ' + record.highest_result + ' · Dif. ' + record.difficulty;
      copy.append(player, title, dice, result);
      const time = document.createElement('time');
      time.dateTime = record.created_at;
      time.textContent = new Date(record.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      item.append(marker, copy, time);
      list.appendChild(item);
    });
  }

  async function publish(record) {
    if (!record || record.type !== 'standard') return { skipped: true, reason: 'not_standard' };
    if (![4, 5, 6, 7].includes(Number(record.difficulty))) {
      return { skipped: true, reason: 'unsupported_difficulty' };
    }

    const db = client();
    if (!db) return { ok: false, reason: 'client_unavailable' };

    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    if (sessionError || !sessionData?.session?.user) {
      return { skipped: true, reason: 'not_signed_in' };
    }

    const userId = sessionData.session.user.id;
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) return { ok: false, reason: 'profile_unavailable' };
    if (profile?.role !== 'player') return { skipped: true, reason: 'not_player' };

    const dice = (record.dice || []).map(die => ({
      sides: Number(die.sides),
      value: Number(die.value),
      determination: die.determination === true
    }));
    const outcome = record.outcome || record.key;
    const titleParts = String(record.title || 'Teste CHRONUS').split(' · ');
    const characterName = record.spec?.characterName || (titleParts.length > 1 ? titleParts.shift() : '');
    const actionLabel = titleParts.join(' · ') || String(record.title || 'Teste CHRONUS');
    const payload = {
      character_name: characterName,
      action_label: actionLabel.slice(0, 160),
      roll_mode: record.mode === 'Rolagem rápida' ? 'Rolagem rápida' : 'Teste guiado',
      dice,
      difficulty: Number(record.difficulty),
      highest_result: Number(record.best),
      margin: Number(record.margin),
      outcome,
      narrative_authority: record.narrative?.authority || 'narrator',
      acts_awarded: Number(record.consequences?.acts || 0),
      condition_awarded: record.consequences?.condition === true,
      determination_used: dice.some(die => die.determination)
    };

    const { error } = await db.from('chronus_roll_events').insert(payload);
    if (error) {
      console.warn('CHRONUS: não foi possível compartilhar a rolagem com o Narrador.', error);
      return { ok: false, reason: 'insert_failed' };
    }
    return { ok: true };
  }

  async function mountSharedRollFeed(container) {
    if (!container) return;
    if (channel) {
      const oldClient = client();
      if (oldClient) await oldClient.removeChannel(channel);
      channel = null;
    }
    records.clear();
    mountedRoot = container;
    container.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'chronus-live-section-title';
    const title = document.createElement('h2');
    title.id = 'chronus-live-feed-title';
    title.textContent = 'Rolagens da mesa';
    const status = document.createElement('span');
    status.className = 'chronus-live-roll-status';
    status.textContent = 'Conectando…';
    heading.append(title, status);
    const list = document.createElement('ol');
    list.dataset.rollFeedList = 'true';
    container.append(heading, list);

    const db = client();
    if (!db) {
      status.textContent = 'Supabase indisponível';
      return;
    }

    const generation = ++feedGeneration;
    async function loadRecentRolls() {
      const { data, error } = await db
        .from('chronus_roll_events')
        .select('id, player_display_name, character_name, action_label, roll_mode, dice, difficulty, highest_result, margin, outcome, narrative_authority, determination_used, acts_awarded, condition_awarded, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (generation !== feedGeneration || !mountedRoot?.isConnected) return;
      if (error) {
        status.textContent = 'Histórico indisponível';
        console.warn('CHRONUS: falha ao recuperar rolagens recentes.', error);
        return;
      }
      (data || []).reverse().forEach(addRecord);
    }

    channel = db
      .channel('chronus-shared-roll-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chronus_roll_events'
      }, payload => addRecord(payload.new))
      .subscribe(subscriptionStatus => {
        if (generation !== feedGeneration || !mountedRoot?.isConnected) return;
        status.textContent = subscriptionStatus === 'SUBSCRIBED'
          ? '● Sincronizada'
          : subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT'
            ? 'Reconectando…'
            : 'Conectando…';
        if (subscriptionStatus === 'SUBSCRIBED') void loadRecentRolls();
      });

    await loadRecentRolls();
  }

  async function unmountNarratorFeed() {
    feedGeneration += 1;
    const db = client();
    if (channel && db) await db.removeChannel(channel);
    channel = null;
    mountedRoot = null;
    records.clear();
  }

  root.ChronusNarrativeLive = Object.freeze({
    publish,
    mountSharedRollFeed,
    unmountSharedRollFeed: unmountNarratorFeed
  });
})(window);
