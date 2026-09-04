'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');

const diceSource = fs.readFileSync('js/modules/dice_roller_v135.js', 'utf8');
const sheetSource = fs.readFileSync('js/modules/sheet_engine.js', 'utf8');
const css = fs.readFileSync('css/dice-roller-v135.css', 'utf8');

for (const marker of [
  'Atributo da ficha',
  'Personalidade',
  'Habilidade',
  'Ficha conectada',
  'dice-guided-action',
  'dice-paradox-sheet-status'
]) {
  assert(diceSource.includes(marker), `sheet integration UI marker missing: ${marker}`);
}

for (const api of ['getRollProfile', 'spendDetermination', 'dischargeParadox']) {
  assert(sheetSource.includes(api), `sheet resource API missing: ${api}`);
}

assert(sheetSource.includes("state.markers[`determination.${spentIndex}`] = 'empty'"), 'Determination must be consumed in the sheet state');
assert(sheetSource.includes('state.paradox = next'), 'Paradox discharge must update the sheet state');
assert(sheetSource.includes("new CustomEvent('chronus:sheet-updated')"), 'sheet changes must notify the roller');
assert(diceSource.includes('window.confirm(`Consumir 1 ponto de Determinação'), 'Determination consumption must require confirmation');
assert(diceSource.includes('window.confirm(`Liberar a Descarga de Paradoxo'), 'Paradox discharge must require confirmation');
assert(diceSource.includes("option.textContent = String(getLabel(item))"), 'sheet option labels must use safe text rendering');
assert(!diceSource.includes('${item.name}</option>'), 'sheet-controlled names must not be interpolated into option HTML');
assert(css.includes('.dice-sheet-grid'), 'responsive sheet selector layout missing');

const context = { window: { crypto: webcrypto } };
vm.createContext(context);
vm.runInContext(diceSource, context);
const engine = context.window.ChronusDiceRollerV135.engine;

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(engine.buildGuidedSpec({
    kind: 'normal',
    action: 'Investigar o bunker',
    sides: 10,
    baseDifficulty: 5,
    adjustment: 1,
    determination: true,
    attributeName: 'Razão',
    personality: 'Analítico',
    skill: 'Investigação',
    characterName: 'Mara'
  }))),
  {
    kind: 'normal',
    title: 'Investigar o bunker',
    sides: 10,
    count: 3,
    baseDifficulty: 5,
    adjustment: 1,
    difficulty: 6,
    determination: true,
    attributeName: 'Razão',
    personality: 'Analítico',
    skill: 'Investigação',
    characterName: 'Mara'
  }
);

const attributeOnly = engine.buildGuidedSpec({ kind: 'combat', sides: 6, baseDifficulty: 4 });
assert.strictEqual(attributeOnly.count, 1, 'attribute alone must roll one die');
assert.strictEqual(attributeOnly.title, 'Ataque ou defesa');

const oneSource = engine.buildGuidedSpec({ kind: 'normal', sides: 8, baseDifficulty: 6, adjustment: -2, skill: 'Ocultismo' });
assert.strictEqual(oneSource.count, 2, 'one applicable source must add exactly one die');
assert.strictEqual(oneSource.difficulty, 4, 'situation adjustment must calculate final difficulty');

console.log('v1.4.4 sheet-to-dice integration regression: PASS');
