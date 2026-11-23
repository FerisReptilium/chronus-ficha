'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const auth = fs.readFileSync('js/services/auth.js', 'utf8');

for (const [id, title] of [['authGate', 'authTitle'], ['passwordGate', 'passwordTitle']]) {
  const dialogMarkup = new RegExp(`id="${id}"[^>]*role="dialog"[^>]*aria-modal="true"`);
  assert(dialogMarkup.test(html), `${id} must be an accessible modal dialog`);
  assert(html.includes(`aria-labelledby="${title}" aria-hidden="true" inert`), `${id} must have an accessible name and start inert`);
}
assert(html.includes('<h2 id="authTitle">CHRONUS</h2>'), 'Authentication dialog must have a stable accessible title');
assert(auth.includes('function getModalFocusableElements(modal)'), 'Modal focusable controls must be enumerated');
assert(auth.includes("if (event.key === 'Escape')"), 'Escape must dismiss the active dialog');
assert(auth.includes("event.shiftKey && (document.activeElement === first || document.activeElement === modal)"), 'Shift+Tab must wrap to the final dialog control');
assert(auth.includes('document.activeElement === last'), 'Tab must wrap to the first dialog control');
assert(auth.includes("modal.setAttribute('aria-hidden', 'false')"), 'Opening a dialog must expose it to assistive technology');
assert(auth.includes('modal.inert = true'), 'Closing a dialog must remove it from interaction');
assert(auth.includes('returnFocus.focus()'), 'Closing a dialog must restore focus to its opener');

console.log('CHRONUS v1.5.5 authentication modal accessibility regression: PASS');
