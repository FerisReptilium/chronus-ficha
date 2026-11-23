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
assert(router.includes("closeBtn?.addEventListener('keydown'"), 'Shift+Tab wrapping must be bound directly to the drawer close control');
assert(router.includes("links[links.length - 1].focus()"), 'Shift+Tab from the close control must focus the last navigation link');
assert(router.includes("drawer?.addEventListener('keydown'"), 'The drawer must own its keyboard navigation handler');
assert(router.includes("event.target === last"), 'Tab from the final navigation link must wrap to the first drawer control');
assert(router.includes("event.stopImmediatePropagation()"), 'The focus trap must prevent competing keyboard handlers from overriding focus');
assert(router.includes('closeBtn?.focus()'), 'Opening the drawer must move focus inside it');
assert(router.includes('toggleBtn.focus()'), 'Closing the drawer must restore focus to the toggle');

console.log('CHRONUS v1.5.4 mobile navigation accessibility regression: PASS');
