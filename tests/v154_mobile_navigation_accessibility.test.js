'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const router = fs.readFileSync('js/router.js', 'utf8');

assert(html.includes('aria-controls="mobile-nav-drawer"'), 'Mobile menu toggle must reference its controlled drawer');
assert(html.includes('aria-expanded="false"'), 'Mobile menu toggle must expose its initial collapsed state');
assert(html.includes('role="dialog" aria-modal="true"'), 'Mobile drawer must be exposed as a modal dialog');
assert(html.includes('aria-labelledby="mobile-nav-title"'), 'Mobile drawer must have an accessible name');
assert(html.includes('aria-hidden="true" inert'), 'Mobile drawer must be unavailable to assistive technology while closed');
assert(router.includes("drawer.setAttribute('aria-hidden', 'false')"), 'Opening the drawer must expose it to assistive technology');
assert(router.includes("toggleBtn?.setAttribute('aria-expanded', 'true')"), 'Opening the drawer must update the toggle state');
assert(router.includes("if (event.key === 'Escape')"), 'Escape must close the mobile drawer');
assert(router.includes("document.addEventListener('keydown'"), 'Keyboard focus management must capture keyboard events at document level');
assert(router.includes("drawer.contains(eventOrigin)"), 'The focus trap must recognize the keyboard event origin inside the drawer');
assert(router.includes("event.stopImmediatePropagation()"), 'The focus trap must prevent competing keyboard handlers from overriding focus');
assert(router.includes("event.shiftKey && (current === first || current === closeBtn || current === drawer)"), 'Shift+Tab from the close button or first drawer control must wrap to the last focusable element');
assert(router.includes("current === last"), 'Tab must wrap at the end of the drawer');
assert(router.includes('closeBtn?.focus()'), 'Opening the drawer must move focus inside it');
assert(router.includes('toggleBtn.focus()'), 'Closing the drawer must restore focus to the toggle');

console.log('CHRONUS v1.5.4 mobile navigation accessibility regression: PASS');
