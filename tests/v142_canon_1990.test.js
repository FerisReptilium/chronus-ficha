const fs = require('fs');
const assert = require('assert');

const canonFiles = [
  'js/modules/home.js',
  'js/modules/home_v132.js',
  'js/modules/portal_v133.js',
  'css/cinematic-chronicle-page-v13.css',
];

for (const file of canonFiles) {
  const source = fs.readFileSync(file, 'utf8')
    .replaceAll('hero-berlin-1992.webp', 'hero-berlin-art.webp');

  assert(!source.includes('1992'), `${file} must not expose the former 1992 canon`);
  assert(source.includes('1990'), `${file} must expose the Berlin 1990 canon`);
}

const home = fs.readFileSync('js/modules/home.js', 'utf8');
assert(home.includes('datetime="1990-05-07"'), 'session dates must use the 1990 machine-readable year');
assert(home.includes('ARQ/BER/1990'), 'archive identifiers must follow the 1990 canon');

console.log('v1.4.2 Berlin 1990 canon regression: PASS');
