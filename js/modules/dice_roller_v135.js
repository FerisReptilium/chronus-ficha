/**
 * CHRONUS v1.3.5 — Rolador oficial do Manual de Bolso.
 *
 * Prioriza a rolagem rápida e mantém o fluxo detalhado como opção. Testes
 * normais conservam o maior dado; Descargas de Paradoxo contam sucessos.
 */
window.ChronusDiceRollerV135 = (function() {
  'use strict';

  const STYLE_HREF = 'css/dice-roller-v135.css';
  const SETTINGS_KEY = 'chronus.dice.settings.v1';
  const HISTORY_KEY = 'chronus.dice.history.v1';
  const MAX_HISTORY = 20;
  const DIE_SIDES = [4, 6, 8, 10, 12];
  const DIFFICULTIES = {
    4: 'Fácil',
    5: 'Normal',
    6: 'Difícil',
    7: 'Muito difícil'
  };
  const GUIDED_KINDS = {
    normal: {
      title: 'Teste normal',
      first: 'Personalidade se aplica',
      second: 'Habilidade se aplica'
    },
    combat: {
      title: 'Ataque ou defesa',
      first: 'Personalidade se aplica',
      second: 'Habilidade se aplica'
    },
    improvised: {
      title: 'Magia improvisada',
      first: 'Paradigma sustenta o efeito',
      second: 'Método ou Instrumento coerente'
    },
    formula: {
      title: 'Fórmula de Desperto',
      first: 'Paradigma se aplica',
      second: 'Habilidade se aplica'
    },
    technocratic: {
      title: 'Fórmula tecnocrática',
      first: 'Paradigma se aplica',
      second: 'Habilidade se aplica'
    }
  };

  let initialized = false;
  let previousFocus = null;
  let history = [];
  let lastRecord = null;
  let animationTimer = 0;
  let sheetProfile = null;

  function ensureStylesheet() {
    if (document.querySelector('link[data-chronus-v135="dice-roller"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.chronusV135 = 'dice-roller';
    document.head.appendChild(link);
  }

  function safeRead(key, fallback) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key));
      return value ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function secureDie(sides) {
    if (!DIE_SIDES.includes(Number(sides))) throw new RangeError('Dado não suportado.');
    const range = 0x100000000;
    const limit = range - (range % sides);
    const sample = new Uint32Array(1);
    do window.crypto.getRandomValues(sample); while (sample[0] >= limit);
    return (sample[0] % sides) + 1;
  }

  function rollDice(sides, count) {
    return Array.from({ length: count }, () => secureDie(sides));
  }

  function evaluateStandard(values, difficulty) {
    const best = Math.max(...values);
    const margin = best - difficulty;
    if (margin > 0) return { best, margin, key: 'success', label: 'Sucesso' };
    if (margin === 0) return { best, margin, key: 'complication', label: 'Sucesso com Complicação' };
    return { best, margin, key: 'failure', label: 'Falha ou Complicação' };
  }

  function paradoxIntensity(successes) {
    if (successes === 0) return 'Ameaça';
    if (successes === 1) return 'Pequena';
    if (successes === 2) return 'Significativa';
    if (successes === 3) return 'Grave';
    if (successes === 4) return 'Muito grave';
    return 'Excepcional';
  }

  function paradoxSeverity(paradox) {
    if (paradox <= 5) return 'Trivial';
    if (paradox <= 10) return 'Menor';
    if (paradox <= 15) return 'Significativa';
    if (paradox <= 20) return 'Severa';
    return 'Catastrófica';
  }

  function paradoxAfter(paradox) {
    if (paradox <= 5) return 0;
    if (paradox <= 10) return 5;
    if (paradox <= 15) return 10;
    if (paradox <= 20) return 15;
    return 20;
  }

  function getParadoxPool(rawParadox) {
    const paradox = Math.max(1, Math.floor(Number(rawParadox) || 1));
    if (paradox <= 5) {
      return { paradox, count: paradox, sides: 8, difficulty: 6, damage: 'Contundente', severity: paradoxSeverity(paradox), after: paradoxAfter(paradox) };
    }
    if (paradox <= 10) {
      return { paradox, count: paradox - 5, sides: 10, difficulty: 5, damage: 'Letal', severity: paradoxSeverity(paradox), after: paradoxAfter(paradox) };
    }
    return { paradox, count: Math.min(3, paradox - 10), sides: 12, difficulty: 4, damage: 'Agravada', severity: paradoxSeverity(paradox), after: paradoxAfter(paradox) };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function difficultyButtons(prefix) {
    return Object.entries(DIFFICULTIES).map(([value, label]) => `
      <button type="button" class="dice-choice dice-difficulty-choice" data-group="${prefix}-difficulty" data-value="${value}" aria-pressed="${value === '5'}">
        <strong>${value}</strong><span>${label}</span>
      </button>`).join('');
  }

  function dieButtons(prefix, includeD12 = true) {
    return DIE_SIDES.filter(sides => includeD12 || sides !== 12).map(sides => `
      <button type="button" class="dice-choice dice-type-choice is-d${sides}" data-group="${prefix}-sides" data-value="${sides}" aria-pressed="${sides === 8}">
        <span aria-hidden="true">D${sides}</span><strong>D${sides}</strong>
      </button>`).join('');
  }

  function buildUi() {
    if (document.getElementById('chronus-dice-launcher')) return;
    const root = document.createElement('div');
    root.id = 'chronus-dice-root';
    root.className = 'chronus-dice-root no-print';
    root.innerHTML = `
      <button type="button" id="chronus-dice-launcher" class="chronus-dice-launcher" aria-haspopup="dialog" aria-controls="chronus-dice-overlay">
        <span class="chronus-dice-launcher-icon" aria-hidden="true">◆</span>
        <span><small>CHRONUS</small><strong>Rolar dados</strong></span>
      </button>

      <div id="chronus-dice-overlay" class="chronus-dice-overlay" hidden>
        <div class="chronus-dice-backdrop" data-dice-close></div>
        <section class="chronus-dice-dialog" role="dialog" aria-modal="true" aria-labelledby="chronus-dice-title">
          <header class="chronus-dice-header">
            <div><span>Ferramenta de mesa</span><h2 id="chronus-dice-title">Rolador CHRONUS</h2></div>
            <button type="button" class="chronus-dice-close" data-dice-close aria-label="Fechar rolador">×</button>
          </header>

          <nav class="chronus-dice-tabs" role="tablist" aria-label="Modos de rolagem">
            <button type="button" role="tab" id="dice-tab-quick" aria-controls="dice-panel-quick" aria-selected="true" data-dice-tab="quick">Rápido</button>
            <button type="button" role="tab" id="dice-tab-guided" aria-controls="dice-panel-guided" aria-selected="false" data-dice-tab="guided">Guiado</button>
            <button type="button" role="tab" id="dice-tab-paradox" aria-controls="dice-panel-paradox" aria-selected="false" data-dice-tab="paradox">Paradoxo</button>
          </nav>

          <div class="chronus-dice-body">
            <div class="chronus-dice-controls">
              <section id="dice-panel-quick" class="chronus-dice-panel" role="tabpanel" aria-labelledby="dice-tab-quick" data-dice-panel="quick">
                <div class="dice-field dice-field-action">
                  <label for="dice-quick-action">Ação <small>opcional</small></label>
                  <input id="dice-quick-action" type="text" maxlength="48" placeholder="Ex.: Investigar a sala">
                </div>
                <fieldset class="dice-fieldset"><legend>Qual dado?</legend><div class="dice-choice-grid dice-type-grid">${dieButtons('quick')}</div></fieldset>
                <fieldset class="dice-fieldset"><legend>Quantidade</legend><div class="dice-choice-grid dice-count-grid">
                  <button type="button" class="dice-choice" data-group="quick-count" data-value="1" aria-pressed="false">1 dado</button>
                  <button type="button" class="dice-choice" data-group="quick-count" data-value="2" aria-pressed="false">2 dados</button>
                  <button type="button" class="dice-choice" data-group="quick-count" data-value="3" aria-pressed="true">3 dados</button>
                </div></fieldset>
                <fieldset class="dice-fieldset"><legend>Dificuldade</legend><div class="dice-choice-grid dice-difficulty-grid">${difficultyButtons('quick')}</div></fieldset>
                <label class="dice-toggle"><input id="dice-quick-determination" type="checkbox"><span></span><strong>Gastar Determinação</strong><small>Adiciona +1d12 fora do limite</small></label>
                <p id="dice-quick-warning" class="dice-rule-warning" hidden></p>
                <div id="dice-quick-summary" class="dice-roll-summary"></div>
                <button type="button" id="dice-quick-roll" class="dice-roll-button"><span>Rolar agora</span><strong>→</strong></button>
              </section>

              <section id="dice-panel-guided" class="chronus-dice-panel" role="tabpanel" aria-labelledby="dice-tab-guided" data-dice-panel="guided" hidden>
                <div class="dice-field"><label for="dice-guided-kind">Tipo de teste</label><select id="dice-guided-kind">
                  <option value="normal">Teste normal</option><option value="combat">Ataque ou defesa</option><option value="improvised">Magia improvisada</option><option value="formula">Fórmula de Desperto</option><option value="technocratic">Fórmula tecnocrática</option>
                </select></div>
                <div id="dice-sheet-status" class="dice-sheet-status" role="status"></div>
                <div class="dice-field"><label for="dice-guided-action">Ação <small>opcional</small></label><input id="dice-guided-action" type="text" maxlength="64" placeholder="Ex.: Examinar o arquivo da Stasi"></div>
                <div class="dice-sheet-grid">
                  <div class="dice-field"><label for="dice-guided-attribute">Atributo da ficha</label><select id="dice-guided-attribute"><option value="">Selecionar atributo</option></select></div>
                  <div class="dice-field"><label for="dice-guided-personality">Personalidade</label><select id="dice-guided-personality"><option value="">Não aplicar</option></select></div>
                  <div class="dice-field"><label for="dice-guided-skill">Habilidade</label><select id="dice-guided-skill"><option value="">Não aplicar</option></select></div>
                </div>
                <fieldset id="dice-guided-manual-die" class="dice-fieldset"><legend>Dado-base manual</legend><div class="dice-choice-grid dice-type-grid">${dieButtons('guided', false)}</div></fieldset>
                <fieldset class="dice-fieldset"><legend>Dificuldade-base</legend><div class="dice-choice-grid dice-difficulty-grid">${difficultyButtons('guided')}</div></fieldset>
                <div class="dice-field"><label for="dice-guided-adjustment">Ajuste da situação</label><select id="dice-guided-adjustment">
                  <option value="0">Sem ajuste</option><option value="-1">−1 · preparação ou ajuda</option><option value="-2">−2 · ajuste autorizado pelo Narrador</option><option value="1">+1 · alcance médio ou cobertura parcial</option><option value="2">+2 · alcance longo ou cobertura forte</option>
                </select></div>
                <label class="dice-toggle"><input id="dice-guided-determination" type="checkbox"><span></span><strong>Gastar Determinação</strong><small id="dice-guided-determination-note">Adiciona +1d12 fora do limite</small></label>
                <p id="dice-guided-warning" class="dice-rule-warning" hidden></p>
                <div id="dice-guided-summary" class="dice-roll-summary"></div>
                <button type="button" id="dice-guided-roll" class="dice-roll-button"><span>Rolar teste</span><strong>→</strong></button>
              </section>

              <section id="dice-panel-paradox" class="chronus-dice-panel" role="tabpanel" aria-labelledby="dice-tab-paradox" data-dice-panel="paradox" hidden>
                <div class="dice-paradox-intro"><span>Exceção do sistema</span><p>Cada dado que igualar ou superar a dificuldade conta como um sucesso individual.</p></div>
                <div id="dice-paradox-sheet-status" class="dice-sheet-status" role="status"></div>
                <div class="dice-field"><label for="dice-paradox-value">Paradoxo acumulado</label><input id="dice-paradox-value" type="number" min="1" max="99" inputmode="numeric" value="1"></div>
                <div id="dice-paradox-summary" class="dice-roll-summary dice-paradox-summary"></div>
                <button type="button" id="dice-paradox-roll" class="dice-roll-button dice-roll-button-paradox"><span>Liberar Descarga</span><strong>⚠</strong></button>
              </section>
            </div>

            <aside class="chronus-dice-result" aria-label="Resultado da rolagem">
              <div id="dice-result-empty" class="dice-result-empty"><span aria-hidden="true">◇</span><strong>Pronto para rolar</strong><p>Escolha os dados. A margem oficial aparecerá aqui imediatamente.</p></div>
              <div id="dice-result-content" hidden>
                <div class="dice-result-head"><span id="dice-result-mode">Teste</span><time id="dice-result-time"></time></div>
                <h3 id="dice-result-title">Resultado</h3>
                <div id="dice-result-values" class="dice-result-values"></div>
                <div id="dice-result-verdict" class="dice-result-verdict" role="status" aria-live="polite"></div>
                <p id="dice-result-rule" class="dice-result-rule"></p>
                <div class="dice-result-actions">
                  <button type="button" id="dice-repeat-roll">↻ Repetir</button>
                  <button type="button" id="dice-copy-result">Copiar resultado</button>
                </div>
              </div>
              <details class="dice-history"><summary>Últimas rolagens <span id="dice-history-count">0</span></summary><ol id="dice-history-list"></ol><button type="button" id="dice-clear-history">Limpar histórico</button></details>
            </aside>
          </div>
        </section>
      </div>
      <div id="chronus-dice-stage" class="chronus-dice-stage" aria-hidden="true"></div>`;
    document.body.appendChild(root);
  }

  function selected(group) {
    return Number(document.querySelector(`[data-group="${group}"][aria-pressed="true"]`)?.dataset.value);
  }

  function choose(group, value) {
    document.querySelectorAll(`[data-group="${group}"]`).forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.value) === Number(value)));
    });
  }

  function formatMargin(margin) {
    if (margin > 0) return `+${margin}`;
    if (margin < 0) return `−${Math.abs(margin)}`;
    return '0';
  }

  function poolExpression(sides, count, determination) {
    return `${count}d${sides}${determination ? ' + 1d12' : ''}`;
  }

  function hasSheetData(profile) {
    return Boolean(profile && (profile.characterName || profile.attributes?.length || profile.personalities?.length || profile.skills?.length || profile.determination || profile.paradox));
  }

  function fillSheetSelect(id, items, placeholder, getValue, getLabel) {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = String(getValue(item));
      option.textContent = String(getLabel(item));
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  function refreshSheetIntegration() {
    const api = window.ChronusSheetEngine;
    sheetProfile = typeof api?.getRollProfile === 'function' ? api.getRollProfile() : null;
    const status = document.getElementById('dice-sheet-status');
    const paradoxStatus = document.getElementById('dice-paradox-sheet-status');
    const determination = document.getElementById('dice-guided-determination');
    const quickDetermination = document.getElementById('dice-quick-determination');
    const determinationNote = document.getElementById('dice-guided-determination-note');
    const attributes = sheetProfile?.attributes || [];
    const personalities = sheetProfile?.personalities || [];
    const skills = sheetProfile?.skills || [];

    fillSheetSelect('dice-guided-attribute', attributes, attributes.length ? 'Selecionar atributo' : 'Nenhum atributo preenchido', item => item.name, item => `${item.name} · ${item.die}`);
    fillSheetSelect('dice-guided-personality', personalities, personalities.length ? 'Não aplicar' : 'Nenhuma Personalidade preenchida', item => item, item => item);
    fillSheetSelect('dice-guided-skill', skills, skills.length ? 'Não aplicar' : 'Nenhuma Habilidade preenchida', item => item, item => item);
    const attributeSelect = document.getElementById('dice-guided-attribute');
    if (attributes.length && !attributeSelect.value) attributeSelect.value = attributes[0].name;
    document.getElementById('dice-guided-manual-die').hidden = attributes.length > 0;

    if (status) {
      status.classList.toggle('is-linked', hasSheetData(sheetProfile));
      status.textContent = hasSheetData(sheetProfile)
        ? `Ficha conectada${sheetProfile.characterName ? ` · ${sheetProfile.characterName}` : ''}`
        : 'Preencha a ficha para montar a reserva automaticamente. O modo manual continua disponível.';
    }
    if (determination) {
      determination.disabled = sheetProfile?.readOnly === true || (hasSheetData(sheetProfile) && sheetProfile.determination < 1);
      if (determination.disabled) determination.checked = false;
    }
    if (quickDetermination) {
      quickDetermination.disabled = sheetProfile?.readOnly === true || (hasSheetData(sheetProfile) && sheetProfile.determination < 1);
      if (quickDetermination.disabled) quickDetermination.checked = false;
    }
    if (determinationNote) determinationNote.textContent = hasSheetData(sheetProfile)
      ? `${sheetProfile.determination} ponto${sheetProfile.determination === 1 ? '' : 's'} ${sheetProfile.determination === 1 ? 'disponível' : 'disponíveis'} · adiciona +1d12`
      : 'Adiciona +1d12 fora do limite';
    if (hasSheetData(sheetProfile) && sheetProfile.paradox > 0) {
      document.getElementById('dice-paradox-value').value = String(sheetProfile.paradox);
    }
    if (paradoxStatus) {
      paradoxStatus.classList.toggle('is-linked', hasSheetData(sheetProfile));
      paradoxStatus.textContent = hasSheetData(sheetProfile)
        ? `Ficha conectada · Paradoxo ${sheetProfile.paradox}`
        : 'Sem Paradoxo vinculado à ficha; informe o valor manualmente.';
    }
    updateGuidedSummary();
    updateParadoxSummary();
  }

  function showMechanicalWarning(target, maxFace, difficulty) {
    if (!target) return;
    target.hidden = true;
    target.textContent = '';
    if (maxFace < difficulty) {
      target.textContent = 'Sem outro bônus, esta reserva não consegue alcançar a Dificuldade. Confirme se a ação é possível na ficção.';
      target.hidden = false;
    } else if (maxFace === difficulty) {
      target.textContent = 'O melhor resultado possível é Sucesso com Complicação.';
      target.hidden = false;
    }
  }

  function updateQuickSummary() {
    const sides = selected('quick-sides') || 8;
    const count = selected('quick-count') || 3;
    const difficulty = selected('quick-difficulty') || 5;
    const determination = document.getElementById('dice-quick-determination')?.checked === true;
    const summary = document.getElementById('dice-quick-summary');
    if (summary) summary.innerHTML = `<span>Reserva</span><strong>${poolExpression(sides, count, determination)}</strong><i></i><span>Dificuldade</span><strong>${difficulty} · ${DIFFICULTIES[difficulty] || 'Ajustada'}</strong>`;
    showMechanicalWarning(document.getElementById('dice-quick-warning'), determination ? 12 : sides, difficulty);
    saveSettings();
  }

  function buildGuidedSpec(input) {
    const kind = GUIDED_KINDS[input.kind] ? input.kind : 'normal';
    const sides = [4, 6, 8, 10].includes(Number(input.sides)) ? Number(input.sides) : 8;
    const personality = String(input.personality || '').trim();
    const skill = String(input.skill || '').trim();
    const baseDifficulty = Math.max(1, Number(input.baseDifficulty) || 5);
    const adjustment = Math.max(-2, Math.min(2, Number(input.adjustment) || 0));
    return {
      kind,
      title: String(input.action || '').trim() || GUIDED_KINDS[kind].title,
      sides,
      count: 1 + Number(Boolean(personality)) + Number(Boolean(skill)),
      baseDifficulty,
      adjustment,
      difficulty: Math.max(1, baseDifficulty + adjustment),
      determination: input.determination === true,
      attributeName: String(input.attributeName || '').trim(),
      personality,
      skill,
      characterName: String(input.characterName || '').trim()
    };
  }

  function guidedSpec() {
    const kind = document.getElementById('dice-guided-kind')?.value || 'normal';
    const attributeName = document.getElementById('dice-guided-attribute')?.value || '';
    const attribute = sheetProfile?.attributes?.find(item => item.name === attributeName);
    const personality = document.getElementById('dice-guided-personality')?.value || '';
    const skill = document.getElementById('dice-guided-skill')?.value || '';
    const action = document.getElementById('dice-guided-action')?.value.trim() || '';
    const baseDifficulty = selected('guided-difficulty') || 5;
    const adjustment = Number(document.getElementById('dice-guided-adjustment')?.value || 0);
    const determination = document.getElementById('dice-guided-determination')?.checked === true;
    return buildGuidedSpec({ kind, action, sides: attribute?.sides || selected('guided-sides') || 8, baseDifficulty, adjustment, determination, attributeName, personality, skill, characterName: sheetProfile?.characterName || '' });
  }

  function updateGuidedLabels() {
    const kind = document.getElementById('dice-guided-kind')?.value || 'normal';
    if (!GUIDED_KINDS[kind]) return;
    updateGuidedSummary();
  }

  function updateGuidedSummary() {
    const spec = guidedSpec();
    const summary = document.getElementById('dice-guided-summary');
    const adjustment = spec.adjustment === 0 ? '' : ` <small>(${spec.adjustment > 0 ? '+' : '−'}${Math.abs(spec.adjustment)})</small>`;
    const sources = [spec.attributeName, spec.personality, spec.skill].filter(Boolean).join(' + ');
    if (summary) summary.innerHTML = `<span>${escapeHtml(sources || spec.title)}</span><strong>${poolExpression(spec.sides, spec.count, spec.determination)}</strong><i></i><span>Dificuldade final</span><strong>${spec.difficulty}${adjustment}</strong>`;
    showMechanicalWarning(document.getElementById('dice-guided-warning'), spec.determination ? 12 : spec.sides, spec.difficulty);
  }

  function updateParadoxSummary() {
    const pool = getParadoxPool(document.getElementById('dice-paradox-value')?.value);
    const summary = document.getElementById('dice-paradox-summary');
    if (summary) summary.innerHTML = `<span>Reserva automática</span><strong>${pool.count}d${pool.sides}</strong><i></i><span>Dificuldade</span><strong>${pool.difficulty}</strong><small>${pool.damage} · gravidade ${pool.severity.toLowerCase()} · recua para ${pool.after}</small>`;
  }

  function saveSettings() {
    if (!initialized) return;
    safeWrite(SETTINGS_KEY, {
      quickSides: selected('quick-sides') || 8,
      quickCount: selected('quick-count') || 3,
      quickDifficulty: selected('quick-difficulty') || 5,
      quickDetermination: document.getElementById('dice-quick-determination')?.checked === true,
      action: document.getElementById('dice-quick-action')?.value || ''
    });
  }

  function restoreSettings() {
    const settings = safeRead(SETTINGS_KEY, {});
    if (DIE_SIDES.includes(settings.quickSides)) choose('quick-sides', settings.quickSides);
    if ([1, 2, 3].includes(settings.quickCount)) choose('quick-count', settings.quickCount);
    if ([4, 5, 6, 7].includes(settings.quickDifficulty)) choose('quick-difficulty', settings.quickDifficulty);
    document.getElementById('dice-quick-determination').checked = settings.quickDetermination === true;
    document.getElementById('dice-quick-action').value = String(settings.action || '').slice(0, 48);
  }

  function createStandardRecord(spec) {
    const baseValues = rollDice(spec.sides, spec.count);
    const dice = baseValues.map(value => ({ sides: spec.sides, value, determination: false }));
    if (spec.determination) dice.push({ sides: 12, value: secureDie(12), determination: true });
    const evaluation = evaluateStandard(dice.map(item => item.value), spec.difficulty);
    return {
      type: 'standard',
      mode: spec.mode,
      title: spec.title || 'Teste CHRONUS',
      expression: poolExpression(spec.sides, spec.count, spec.determination),
      difficulty: spec.difficulty,
      dice,
      ...evaluation,
      timestamp: new Date().toISOString(),
      spec
    };
  }

  function createParadoxRecord(paradox) {
    const pool = getParadoxPool(paradox);
    const dice = rollDice(pool.sides, pool.count).map(value => ({ sides: pool.sides, value, success: value >= pool.difficulty }));
    const successes = dice.filter(item => item.success).length;
    return {
      type: 'paradox', mode: 'Descarga de Paradoxo', title: `Paradoxo ${pool.paradox}`,
      expression: `${pool.count}d${pool.sides}`, difficulty: pool.difficulty, dice,
      successes, intensity: paradoxIntensity(successes), pool,
      timestamp: new Date().toISOString(), spec: { mode: 'paradox', paradox: pool.paradox }
    };
  }

  function diceSvg(sides, value) {
    const shapes = {
      4: '<path d="M50 6 L94 88 L6 88 Z"/><path class="facet" d="M50 6 L50 88 M6 88 L72 48 M94 88 L28 48"/>',
      6: '<path d="M19 27 L50 9 L82 27 L82 70 L50 91 L19 70 Z"/><path class="facet" d="M19 27 L50 46 L82 27 M50 46 L50 91"/>',
      8: '<path d="M50 4 L94 50 L50 96 L6 50 Z"/><path class="facet" d="M50 4 L50 96 M6 50 L50 37 L94 50 L50 64 Z"/>',
      10: '<path d="M50 3 L92 35 L76 91 L24 91 L8 35 Z"/><path class="facet" d="M50 3 L50 36 L92 35 M50 36 L76 91 M50 36 L24 91 M50 36 L8 35"/>',
      12: '<path d="M30 5 L70 5 L94 28 L94 69 L70 94 L30 94 L6 69 L6 28 Z"/><path class="facet" d="M30 5 L36 31 L6 28 M70 5 L64 31 L94 28 M94 69 L68 64 L70 94 M30 94 L32 64 L6 69 M36 31 L64 31 L68 64 L32 64 Z"/>'
    };
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><g>${shapes[sides]}</g><text x="50" y="56">${value}</text><small>D${sides}</small></svg>`;
  }

  function animateDice(dice) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stage = document.getElementById('chronus-dice-stage');
    if (!stage) return;
    window.clearTimeout(animationTimer);
    stage.replaceChildren();
    const spread = Math.min(92, Math.max(54, 560 / Math.max(dice.length, 1)));
    dice.forEach((item, index) => {
      const visual = document.createElement('div');
      const centeredIndex = index - ((dice.length - 1) / 2);
      const randomOffset = secureDie(12) - 6;
      const direction = index % 2 === 0 ? 1 : -1;
      visual.className = `chronus-dice-fall is-d${item.sides}${item.determination ? ' is-determination' : ''}`;
      visual.style.setProperty('--dice-x', `${Math.round(centeredIndex * spread)}px`);
      visual.style.setProperty('--dice-start-x', `${randomOffset * 14}px`);
      visual.style.setProperty('--dice-spin', `${direction * (520 + secureDie(12) * 38)}deg`);
      visual.style.setProperty('--dice-delay', `${index * 42}ms`);
      visual.innerHTML = diceSvg(item.sides, item.value);
      stage.appendChild(visual);
    });
    stage.classList.add('is-active');
    animationTimer = window.setTimeout(() => {
      stage.classList.remove('is-active');
      stage.replaceChildren();
    }, 1320 + (dice.length * 42));
  }

  function valueTokens(record) {
    return record.dice.map(item => {
      const kept = record.type === 'standard' ? item.value === record.best : item.success;
      const classes = [`is-d${item.sides}`, kept ? 'is-kept' : '', item.determination ? 'is-determination' : ''].filter(Boolean).join(' ');
      return `<span class="dice-result-token ${classes}"><small>D${item.sides}${item.determination ? ' · DET' : ''}</small><strong>${item.value}</strong></span>`;
    }).join('');
  }

  function recordText(record) {
    const values = record.dice.map(item => `d${item.sides}:${item.value}`).join(', ');
    if (record.type === 'paradox') {
      return `${record.title} — ${record.expression} contra Dificuldade ${record.difficulty}: [${values}]. ${record.successes} sucesso(s) — Intensidade ${record.intensity}.`;
    }
    return `${record.title} — ${record.expression} contra Dificuldade ${record.difficulty}: [${values}]. Maior ${record.best}; Margem ${formatMargin(record.margin)} — ${record.label}.`;
  }

  function renderRecord(record) {
    lastRecord = record;
    document.getElementById('dice-result-empty').hidden = true;
    document.getElementById('dice-result-content').hidden = false;
    document.getElementById('dice-result-mode').textContent = record.mode;
    document.getElementById('dice-result-time').textContent = new Date(record.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('dice-result-title').textContent = record.title;
    document.getElementById('dice-result-values').innerHTML = valueTokens(record);
    const verdict = document.getElementById('dice-result-verdict');
    const rule = document.getElementById('dice-result-rule');
    if (record.type === 'paradox') {
      verdict.className = `dice-result-verdict is-paradox is-intensity-${Math.min(record.successes, 5)}`;
      verdict.innerHTML = `<span>${record.successes} sucesso${record.successes === 1 ? '' : 's'}</span><strong>${escapeHtml(record.intensity)}</strong>`;
      rule.textContent = `Cada resultado igual ou acima de ${record.difficulty} conta. Dano ${record.pool.damage}; gravidade possível ${record.pool.severity.toLowerCase()}; o Paradoxo recua para ${record.pool.after}.`;
    } else {
      verdict.className = `dice-result-verdict is-${record.key}`;
      verdict.innerHTML = `<span>Margem ${formatMargin(record.margin)}</span><strong>${escapeHtml(record.label)}</strong>`;
      rule.textContent = `Maior resultado ${record.best} − Dificuldade ${record.difficulty} = Margem ${formatMargin(record.margin)}.`;
    }
    animateDice(record.dice);
    addHistory(record);
  }

  function addHistory(record) {
    const serializable = JSON.parse(JSON.stringify(record));
    history.unshift(serializable);
    history = history.slice(0, MAX_HISTORY);
    safeWrite(HISTORY_KEY, history);
    renderHistory();
  }

  function renderHistory() {
    const list = document.getElementById('dice-history-list');
    const count = document.getElementById('dice-history-count');
    if (!list || !count) return;
    count.textContent = String(history.length);
    list.innerHTML = history.map(record => {
      const result = record.type === 'paradox' ? `${record.successes} sucessos · ${record.intensity}` : `Margem ${formatMargin(record.margin)} · ${record.label}`;
      return `<li><span>${new Date(record.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><strong>${escapeHtml(record.expression)} · Dif. ${record.difficulty}</strong><small>${escapeHtml(result)}</small></li>`;
    }).join('') || '<li class="is-empty">Nenhuma rolagem registrada.</li>';
  }

  function consumeDeterminationIfNeeded(determination) {
    if (!determination || !hasSheetData(sheetProfile)) return true;
    if (sheetProfile.readOnly) {
      window.alert('A ficha está em modo somente leitura. A Determinação não pode ser consumida.');
      return false;
    }
    if (sheetProfile.determination < 1) {
      window.alert('Não há pontos de Determinação disponíveis na ficha.');
      return false;
    }
    const confirmed = window.confirm(`Consumir 1 ponto de Determinação de ${sheetProfile.characterName || 'sua ficha'} para adicionar 1d12?`);
    if (!confirmed) return false;
    const result = window.ChronusSheetEngine?.spendDetermination?.();
    if (!result?.ok) {
      window.alert(result?.error || 'Não foi possível atualizar a Determinação da ficha.');
      return false;
    }
    refreshSheetIntegration();
    return true;
  }

  function rollQuick() {
    const sides = selected('quick-sides') || 8;
    const count = selected('quick-count') || 3;
    const difficulty = selected('quick-difficulty') || 5;
    const determination = document.getElementById('dice-quick-determination').checked;
    const action = document.getElementById('dice-quick-action').value.trim();
    if (!consumeDeterminationIfNeeded(determination)) return;
    saveSettings();
    const title = [hasSheetData(sheetProfile) ? sheetProfile.characterName : '', action || 'Teste CHRONUS'].filter(Boolean).join(' · ');
    renderRecord(createStandardRecord({ mode: 'Rolagem rápida', title, sides, count, difficulty, determination }));
  }

  function rollGuided() {
    const spec = guidedSpec();
    if (!consumeDeterminationIfNeeded(spec.determination)) return;
    const title = [spec.characterName, spec.title].filter(Boolean).join(' · ');
    renderRecord(createStandardRecord({ mode: 'Teste guiado', title, sides: spec.sides, count: spec.count, difficulty: spec.difficulty, determination: spec.determination, guidedKind: spec.kind, adjustment: spec.adjustment, attributeName: spec.attributeName, personality: spec.personality, skill: spec.skill }));
  }

  function rollParadox() {
    const paradox = Math.max(1, Number(document.getElementById('dice-paradox-value').value) || 1);
    const record = createParadoxRecord(paradox);
    if (hasSheetData(sheetProfile) && sheetProfile.paradox === paradox) {
      if (sheetProfile.readOnly) {
        window.alert('A ficha está em modo somente leitura. O Paradoxo não pode ser alterado.');
        return;
      }
      const confirmed = window.confirm(`Liberar a Descarga de Paradoxo ${paradox} e atualizar a ficha para ${record.pool.after}?`);
      if (!confirmed) return;
      const result = window.ChronusSheetEngine?.dischargeParadox?.(paradox, record.pool.after);
      if (!result?.ok) {
        window.alert(result?.error || 'Não foi possível atualizar o Paradoxo da ficha.');
        return;
      }
    }
    renderRecord(record);
    refreshSheetIntegration();
  }

  function repeatLast() {
    if (!lastRecord?.spec) return;
    if (lastRecord.spec.mode === 'paradox') {
      refreshSheetIntegration();
      if (hasSheetData(sheetProfile)) {
        if (sheetProfile.paradox < 1) {
          window.alert('A ficha não possui Paradoxo acumulado para uma nova Descarga.');
          return;
        }
        document.getElementById('dice-paradox-value').value = String(sheetProfile.paradox);
        rollParadox();
      } else {
        renderRecord(createParadoxRecord(lastRecord.spec.paradox));
      }
    }
    else {
      refreshSheetIntegration();
      if (!consumeDeterminationIfNeeded(lastRecord.spec.determination)) return;
      renderRecord(createStandardRecord(lastRecord.spec));
    }
  }

  async function copyLast() {
    if (!lastRecord) return;
    const button = document.getElementById('dice-copy-result');
    try {
      await navigator.clipboard.writeText(recordText(lastRecord));
      button.textContent = 'Copiado!';
    } catch (error) {
      button.textContent = 'Não foi possível copiar';
    }
    window.setTimeout(() => { button.textContent = 'Copiar resultado'; }, 1500);
  }

  function switchTab(name) {
    document.querySelectorAll('[data-dice-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.diceTab === name)));
    document.querySelectorAll('[data-dice-panel]').forEach(panel => { panel.hidden = panel.dataset.dicePanel !== name; });
  }

  function openDialog() {
    const overlay = document.getElementById('chronus-dice-overlay');
    previousFocus = document.activeElement;
    refreshSheetIntegration();
    overlay.hidden = false;
    document.body.classList.add('is-dice-dialog-open');
    window.requestAnimationFrame(() => overlay.classList.add('is-open'));
    overlay.querySelector('.chronus-dice-close')?.focus();
  }

  function closeDialog() {
    const overlay = document.getElementById('chronus-dice-overlay');
    overlay.classList.remove('is-open');
    document.body.classList.remove('is-dice-dialog-open');
    window.setTimeout(() => { overlay.hidden = true; }, 180);
    previousFocus?.focus?.();
  }

  function trapFocus(event) {
    if (event.key === 'Escape') {
      closeDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector('.chronus-dice-dialog');
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], summary')].filter(element => !element.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function bindEvents() {
    document.getElementById('chronus-dice-launcher').addEventListener('click', openDialog);
    document.querySelectorAll('[data-dice-close]').forEach(button => button.addEventListener('click', closeDialog));
    document.querySelector('.chronus-dice-dialog').addEventListener('keydown', trapFocus);
    document.querySelectorAll('[data-dice-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.diceTab)));
    document.querySelectorAll('.dice-choice[data-group]').forEach(button => button.addEventListener('click', () => {
      choose(button.dataset.group, Number(button.dataset.value));
      if (button.dataset.group.startsWith('quick')) updateQuickSummary();
      else updateGuidedSummary();
    }));
    document.getElementById('dice-quick-determination').addEventListener('change', updateQuickSummary);
    document.getElementById('dice-quick-action').addEventListener('change', saveSettings);
    document.getElementById('dice-guided-kind').addEventListener('change', updateGuidedLabels);
    document.getElementById('dice-guided-action').addEventListener('input', updateGuidedSummary);
    document.getElementById('dice-guided-attribute').addEventListener('change', updateGuidedSummary);
    document.getElementById('dice-guided-personality').addEventListener('change', updateGuidedSummary);
    document.getElementById('dice-guided-skill').addEventListener('change', updateGuidedSummary);
    document.getElementById('dice-guided-adjustment').addEventListener('change', updateGuidedSummary);
    document.getElementById('dice-guided-determination').addEventListener('change', updateGuidedSummary);
    document.getElementById('dice-paradox-value').addEventListener('input', updateParadoxSummary);
    document.getElementById('dice-quick-roll').addEventListener('click', rollQuick);
    document.getElementById('dice-guided-roll').addEventListener('click', rollGuided);
    document.getElementById('dice-paradox-roll').addEventListener('click', rollParadox);
    document.getElementById('dice-repeat-roll').addEventListener('click', repeatLast);
    document.getElementById('dice-copy-result').addEventListener('click', copyLast);
    document.getElementById('dice-clear-history').addEventListener('click', () => {
      history = [];
      safeWrite(HISTORY_KEY, history);
      renderHistory();
    });
  }

  function init() {
    if (initialized) return true;
    initialized = true;
    ensureStylesheet();
    buildUi();
    history = safeRead(HISTORY_KEY, []).slice(0, MAX_HISTORY);
    restoreSettings();
    bindEvents();
    updateQuickSummary();
    updateGuidedLabels();
    updateParadoxSummary();
    renderHistory();
    refreshSheetIntegration();
    window.addEventListener('chronus:sheet-updated', refreshSheetIntegration);
    document.documentElement.dataset.chronusDice = 'v1.3.5-preview';
    return true;
  }

  return {
    init,
    engine: { secureDie, rollDice, evaluateStandard, getParadoxPool, paradoxIntensity, buildGuidedSpec }
  };
})();
