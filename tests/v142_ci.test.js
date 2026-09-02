const fs = require('fs');
const assert = require('assert');

const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const legacyPullRequestWorkflows = [
  '.github/workflows/v11-ci.yml',
  '.github/workflows/v12-ci.yml',
  '.github/workflows/v13-ci.yml',
];

assert(/pull_request:\s*\n\s+branches:\s*\n\s+- main/.test(ci), 'unified CI must run for pull requests targeting main');
assert(ci.includes('workflow_dispatch:'), 'unified CI must support a manual run');
assert(ci.includes('git diff --check'), 'unified CI must reject whitespace errors');
assert(ci.includes("find js tests -type f -name '*.js'"), 'unified CI must syntax-check every JavaScript source and test');
assert(ci.includes('for test_file in tests/*.test.js'), 'unified CI must run the complete regression suite');
assert(ci.includes('/js/modules/chronus_live_v140.js'), 'critical smoke must include the live room module');
assert(ci.includes('playwright@1.61.1'), 'browser QA must use a pinned Playwright version');
assert(ci.includes('node tests/visual/v140_live_preview.js'), 'browser QA must validate the live room on desktop and mobile');
assert(ci.includes('actions/upload-artifact@v4'), 'browser evidence must be retained as an artifact');

for (const workflow of legacyPullRequestWorkflows) {
  const source = fs.readFileSync(workflow, 'utf8');
  assert(!/^\s*pull_request:/m.test(source), `${workflow} must not duplicate pull-request validation`);
  assert(source.includes('workflow_dispatch:'), `${workflow} must remain available for historical manual QA`);
}

console.log('v1.4.2 unified CI regression: PASS');
