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
assert(router.includes('const activeIsInsideDrawer = drawer.contains(document.activeElement);'), 'The focus trap must detect focus escaping the drawer');
assert(router.includes('...(closeBtn?.getClientRects().length && !closeBtn.inert ? [closeBtn] : [])'), 'The close control must be the first item in the deterministic drawer focus order');
assert(router.includes('event.shiftKey && (document.activeElement === first || document.activeElement === drawer || !activeIsInsideDrawer)'), 'Shift+Tab from the first control or escaped focus must wrap to the last navigation link');
assert(router.includes("document.activeElement === last"), 'Tab must wrap at the end of the drawer');
assert(router.includes('closeBtn?.focus()'), 'Opening the drawer must move focus inside it');
assert(router.includes('toggleBtn.focus()'), 'Closing the drawer must restore focus to the toggle');

console.log('CHRONUS v1.5.4 mobile navigation accessibility regression: PASS');
