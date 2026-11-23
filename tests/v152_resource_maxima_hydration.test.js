'use strict';

// Exercises the production normalizeState function directly, without DOM,
// browser storage, or a production Supabase connection.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');
const start = source.indexOf('function normalizeState(s) {');
const end = source.indexOf('function loadState()', start);
assert(start >= 0 && end > start, 'production normalizeState function must be available');

const defaultState = {
  identity: {},
  personalities: ['', ''],
  xp: { current: '', spent: '' },
  attributes: {},
  illumination: 'd4',
  markers: {},
  resources: {},
  lists: {
    skills: [],
    advantages: [],
    equipment: [],
    formulas: [],
    arcana: {}
  },
  page2: { formulas: [], inventory: [], history: '' },
  activePage: 'page-1'
};
const sandbox = {
  ATTRIBUTE_POINTS: Object.fromEntries([
    'Força', 'Vigor', 'Destreza', 'Razão', 'Astúcia',
    'Perseverança', 'Manipulação', 'Presença', 'Vontade'
  ].map(name => [name, []])),
  ARCANA: ['Morte', 'Destino', 'Forças', 'Vida', 'Matéria', 'Mente', 'Primórdio', 'Espaço', 'Espírito', 'Tempo'],
  WOUND_STATES: ['empty', 'slash', 'x', 'star'],
  defaultState,
  clone: value => JSON.parse(JSON.stringify(value))
};
vm.createContext(sandbox);
const normalizeState = vm.runInContext('(' + source.slice(start, end).trim() + ')', sandbox, {
  filename: 'js/modules/sheet_engine.js'
});

function makeState({ attributes, illumination, resources }) {
  return {
    attributes: {
      'Perseverança': attributes?.perseverance || 'd8',
      'Vontade': attributes?.will || 'd8',
      'Vigor': attributes?.vigor || 'd8'
    },
    illumination: illumination || 'd8',
    resources: JSON.parse(JSON.stringify(resources)),
    markers: {},
    lists: {
      skills: [], advantages: [], equipment: [], formulas: [], arcana: {}
    },
    page2: { formulas: [], inventory: [], history: '' }
  };
}

// A full resource follows an increased maximum after reload/hydration.
{
  const state = normalizeState(makeState({
    attributes: { perseverance: 'd10', will: 'd12', vigor: 'd10' },
    illumination: 'd10',
    resources: {
      determination: 8, mana: 25, wounds: 13,
      max: { determination: 8, mana: 25, wounds: 13 }
    }
  }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.resources)), {
    determination: 10, mana: 40, wounds: 15,
    max: { determination: 10, mana: 40, wounds: 15 }
  });
}

// A partially spent resource stays at its current value when the maximum grows.
{
  const state = normalizeState(makeState({
    attributes: { perseverance: 'd10', will: 'd12', vigor: 'd10' },
    illumination: 'd10',
    resources: {
      determination: 5, mana: 9, wounds: 7,
      max: { determination: 8, mana: 25, wounds: 13 }
    }
  }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.resources)), {
    determination: 5, mana: 9, wounds: 7,
    max: { determination: 10, mana: 40, wounds: 15 }
  });
}

// Reducing a maximum clamps the current value; it never exceeds the new cap.
{
  const state = normalizeState(makeState({
    attributes: { perseverance: 'd8', will: 'd10', vigor: 'd6' },
    illumination: 'd6',
    resources: {
      determination: 10, mana: 40, wounds: 15,
      max: { determination: 12, mana: 60, wounds: 17 }
    }
  }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.resources)), {
    determination: 8, mana: 15, wounds: 11,
    max: { determination: 8, mana: 15, wounds: 11 }
  });
}

// Older data without saved maxima keeps its current value instead of being
// treated as full merely because the previous cap is unknown.
{
  const state = normalizeState(makeState({
    attributes: { perseverance: 'd10', will: 'd12', vigor: 'd10' },
    illumination: 'd10',
    resources: { determination: 6, mana: 18, wounds: 9 }
  }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.resources)), {
    determination: 6, mana: 18, wounds: 9,
    max: { determination: 10, mana: 40, wounds: 15 }
  });
}

console.log('CHRONUS v1.5.2 resource maxima hydration regression: PASS');
