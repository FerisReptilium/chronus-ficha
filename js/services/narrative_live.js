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
      const empty = document.createElement('p');
      empty.className = 'narrator-roll-feed-empty';
      empty.textContent = 'Nenhuma rolagem compartilhada nesta mesa ainda.';
      list.appendChild(empty);
      return;
    }

    [...records.values()].forEach(record => {
      const article = document.createElement('article');
      article.className = 'narrator-roll-event';
      const heading = document.createElement('div');
      heading.className = 'narrator-roll-event-heading';
      const player = document.createElement('strong');
      player.textContent = record.player_display_name || 'Jogador';
      const time = document.createElement('time');
      time.dateTime = record.created_at;
      time.textContent = new Date(record.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      heading.append(player, time);

      const title = document.createElement('p');
      title.className = 'narrator-roll-event-title';
      title.textContent = [record.character_name, record.action_label].filter(Boolean).join(' — ');

      const values = document.createElement('p');
      values.className = 'narrator-roll-event-dice';
      values.textContent = (record.dice || []).map(die =>
        'd' + die.sides + ': ' + die.value + (die.determination ? ' (Determinação)' : '')
      ).join(' · ');

      const result = document.createElement('div');
      result.className = 'narrator-roll-event-result outcome-' + record.outcome;
      const resultText = document.createElement('strong');
      resultText.textContent = OUTCOME_LABELS[record.outcome] || record.outcome;
      const margin = document.createElement('span');
      margin.textContent = 'Maior ' + record.highest_result + ' · Dif. ' + record.difficulty +
        ' · Margem ' + (record.margin > 0 ? '+' : '') + record.margin;
      result.append(resultText, margin);

      const authority = document.createElement('p');
      authority.className = 'narrator-roll-event-authority';
      authority.textContent = record.outcome === 'exceptional_success'
        ? 'O jogador descreve a cena de forma épica.'
        : record.outcome === 'success'
          ? 'O jogador descreve como alcança o objetivo.'
          : record.outcome === 'partial_success'
            ? 'Descrição compartilhada: o Narrador acrescenta um preço ao sucesso.'
            : record.outcome === 'failure'
              ? 'O Narrador descreve o insucesso.'
              : 'O Narrador descreve a falha de forma desastrosa e horrível.';

      const consequences = document.createElement('small');
      const consequenceParts = [];
      if (record.acts_awarded) consequenceParts.push('+1 Ato');
      if (record.condition_awarded) consequenceParts.push('1 Condição');
      if (record.determination_used) consequenceParts.push('Determinação utilizada');
      consequences.textContent = consequenceParts.join(' · ');

      article.append(heading, title, values, result, authority);
      if (consequences.textContent) article.appendChild(consequences);
      list.appendChild(article);
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

  async function mountNarratorFeed(container) {
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
    heading.className = 'narrator-roll-feed-heading';
    const title = document.createElement('h3');
    title.textContent = 'Rolagens ao vivo';
    const status = document.createElement('span');
    status.className = 'narrator-roll-feed-status';
    status.textContent = 'Conectando…';
    heading.append(title, status);
    const list = document.createElement('div');
    list.className = 'narrator-roll-feed-list';
    list.dataset.rollFeedList = 'true';
    container.append(heading, list);

    const db = client();
    if (!db) {
      status.textContent = 'Supabase indisponível';
      return;
    }

    channel = db
      .channel('chronus-narrator-roll-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chronus_roll_events'
      }, payload => addRecord(payload.new))
      .subscribe(subscriptionStatus => {
        if (!mountedRoot?.isConnected) return;
        status.textContent = subscriptionStatus === 'SUBSCRIBED'
          ? '● Ao vivo'
          : subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT'
            ? 'Sem conexão ao vivo'
            : 'Conectando…';
      });

    const { data, error } = await db
      .from('chronus_roll_events')
      .select('id, player_display_name, character_name, action_label, roll_mode, dice, difficulty, highest_result, margin, outcome, narrative_authority, determination_used, acts_awarded, condition_awarded, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      status.textContent = 'Não foi possível carregar o histórico';
      console.warn('CHRONUS: falha ao carregar rolagens recentes.', error);
      return;
    }
    (data || []).reverse().forEach(addRecord);
  }

  async function unmountNarratorFeed() {
    const db = client();
    if (channel && db) await db.removeChannel(channel);
    channel = null;
    mountedRoot = null;
    records.clear();
  }

  root.ChronusNarrativeLive = Object.freeze({
    publish,
    mountNarratorFeed,
    unmountNarratorFeed
  });
})(window);
