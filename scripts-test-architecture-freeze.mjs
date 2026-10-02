import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const requiredDirs = [
  'app', 'pages', 'components', 'features', 'services', 'adapters',
  'adapters/movie', 'adapters/live', 'playback', 'playback/core',
  'playback/parser', 'playback/player', 'playback/session',
  'playback/events', 'playback/network', 'playback/errors',
  'data', 'storage', 'state', 'models', 'utils', 'config',
];

for (const dir of requiredDirs) {
  assert.equal(fs.existsSync(path.join(src, dir)), true, `missing frozen directory: src/${dir}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function relativeImports(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
}

const files = walk(src);
const violations = [];
const rules = [
  { name: 'pages -> storage', test: (f,i) => f.includes('/pages/') && /(?:^|\/)storage(?:\/|$)/.test(i) },
  { name: 'pages -> raw playback internals', test: (f,i) => f.includes('/pages/') && /(?:^|\/)playback\/(?:parser|player|session|network|errors)(?:\/|$)/.test(i) },
  { name: 'pages -> adapters', test: (f,i) => f.includes('/pages/') && /(?:^|\/)adapters(?:\/|$)/.test(i) },
  { name: 'components -> storage', test: (f,i) => f.includes('/components/') && /(?:^|\/)storage(?:\/|$)/.test(i) },
  { name: 'adapters -> React state', test: (f,i) => f.includes('/adapters/') && /(?:react|state\/)/.test(i) },
  { name: 'storage -> components', test: (f,i) => f.includes('/storage/') && /(?:^|\/)components(?:\/|$)/.test(i) },
  { name: 'main -> business modules', test: (f,i) => f.endsWith('/main.jsx') && /(?:features|services|adapters|playback|storage|state|models|data)\//.test(i) },
];

for (const file of files) {
  for (const imported of relativeImports(file)) {
    for (const rule of rules) {
      if (rule.test(file, imported)) violations.push(`${rule.name}: ${path.relative(root, file)} -> ${imported}`);
    }
  }
}

assert.deepEqual(violations, [], violations.join('\n'));
assert.match(fs.readFileSync(path.join(src, 'main.jsx'), 'utf8'), /from ['"]\.\/app\/App\.jsx['"]/);
console.log('Architecture freeze checks passed');
