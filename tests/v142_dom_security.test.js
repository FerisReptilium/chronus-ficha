'use strict';

const assert = require('assert');
const fs = require('fs');

const read = file => fs.readFileSync(file, 'utf8');
const auth = read('js/services/auth.js');
const dashboard = read('js/modules/player_dashboard.js');
const narrator = read('js/modules/narrator_panel.js');

assert(auth.includes('userArea.replaceChildren(buildAuthNode(false))'), 'desktop auth UI must use DOM replacement');
assert(auth.includes("createElement('span', 'user-name', displayName)"), 'display name must be assigned through textContent');
assert(!auth.includes('${displayName}'), 'display name must never be interpolated into HTML');

for (const unsafeInterpolation of [
  'class="character-name-heading">${charName}',
  'class="character-concept-lead">"${charConcept}',
  'class="tag-val">${playerName}',
  'class="tag-val">${charTradition}',
  'class="tag-val">${charProfession}',
  '<p>${err.message'
]) {
  assert(!dashboard.includes(unsafeInterpolation), `dashboard contains unsafe interpolation: ${unsafeInterpolation}`);
}
assert(dashboard.includes("element.textContent = String(value ?? '')"), 'dashboard dynamic fields must use textContent');
assert(!dashboard.includes('onclick='), 'dashboard actions must not use inline event handlers');

for (const unsafeInterpolation of [
  'class="player-name-title">${safePlayerName}',
  'class="player-email-sub">${player.email',
  'class="char-highlight-name">${charName}',
  'class="char-highlight-sub">${tradition}',
  'data-char-name="${charName}',
  '<p>${err.message'
]) {
  assert(!narrator.includes(unsafeInterpolation), `narrator panel contains unsafe interpolation: ${unsafeInterpolation}`);
}
assert(narrator.includes("createEl('h3', 'player-name-title', playerName)"), 'narrator player name must use Safe DOM');
assert(narrator.includes('openButton.dataset.charName = charName'), 'character metadata must use dataset assignment');
assert(!narrator.includes('<img src="${url}"'), 'signed portrait URLs must not be interpolated into HTML');
assert(narrator.includes('container.replaceChildren(portrait)'), 'signed portraits must be attached through the DOM');

console.log('v1.4.2 DOM security regression: PASS');
