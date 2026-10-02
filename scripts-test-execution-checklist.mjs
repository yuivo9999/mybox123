import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');

const requiredPaths = [
  'app/App.jsx',
  'main.jsx',
  'pages/MainPage.jsx',
  'pages/PlaybackPage.jsx',
  'components/ErrorBoundary.jsx',
  'features/movie/MovieFeature.jsx',
  'features/live/LiveFeature.jsx',
  'services/movieService.js',
  'services/liveService.js',
  'services/playbackService.js',
  'services/userDataService.js',
  'services/cacheService.js',
  'services/errorService.js',
  'services/requestManager.js',
  'adapters/live/liveAdapter.js',
  'adapters/live/liveRegistry.js',
  'adapters/live/normalizeLive.js',
  'models/content.js',
  'models/live.js',
  'models/playback.js',
  'models/userData.js',
  'playback/playbackCore.js',
  'playback/playbackStateMachine.js',
  'playback/playbackResourceManager.js',
  'player/playerInterface.js',
  'player/html5PlayerAdapter.js',
  'parsers/parserService.js',
  'parsers/parserChain.js',
  'runtime/webViewRuntime.js',
  'state/persistentStateStore.js',
  'state/sessionStateStore.js',
  'storage/storage.js',
  'storage/cache.js',
];

const requiredDirs = [
  'app', 'pages', 'components', 'features', 'services', 'adapters/movie', 'adapters/live',
  'playback/core', 'playback/parser', 'playback/player', 'playback/session',
  'playback/events', 'playback/network', 'playback/errors',
  'data', 'storage', 'state', 'models', 'utils', 'config',
];

for (const dir of requiredDirs) {
  assert.equal(fs.existsSync(path.join(src, dir)), true, `missing required directory: src/${dir}`);
}
for (const file of requiredPaths) {
  assert.equal(fs.existsSync(path.join(src, file)), true, `missing required module: src/${file}`);
}

const requiredScripts = [
  'scripts-test-data-contract.mjs',
  'scripts-test-live.mjs',
  'scripts-test-playback.mjs',
  'scripts-test-parser.mjs',
  'scripts-test-player-core.mjs',
  'scripts-test-state.mjs',
  'scripts-test-movie-feature.mjs',
  'scripts-test-cache.mjs',
  'scripts-test-errors.mjs',
  'scripts-test-webview-runtime.mjs',
  'scripts-test-performance.mjs',
  'scripts-test-architecture-freeze.mjs',
  'scripts-test-acceptance.mjs',
];
for (const file of requiredScripts) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `missing verification script: ${file}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function imports(file) {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
}

const violations = [];
const rules = [
  ['pages -> storage', (f, i) => f.includes('/pages/') && /(?:^|\/)storage(?:\/|$)/.test(i)],
  ['pages -> raw playback internals', (f, i) => f.includes('/pages/') && /(?:^|\/)playback\/(?:parser|player|session|network|errors)(?:\/|$)/.test(i)],
  ['pages -> adapters', (f, i) => f.includes('/pages/') && /(?:^|\/)adapters(?:\/|$)/.test(i)],
  ['components -> storage', (f, i) => f.includes('/components/') && /(?:^|\/)storage(?:\/|$)/.test(i)],
  ['adapters -> React/state', (f, i) => f.includes('/adapters/') && /(?:react|state\/)/.test(i)],
  ['storage -> components', (f, i) => f.includes('/storage/') && /(?:^|\/)components(?:\/|$)/.test(i)],
  ['main -> business modules', (f, i) => f.endsWith('/main.jsx') && /(?:features|services|adapters|playback|storage|state|models|data)\//.test(i)],
];

for (const file of walk(src)) {
  for (const imported of imports(file)) {
    for (const [name, test] of rules) {
      if (test(file, imported)) violations.push(`${name}: ${path.relative(root, file)} -> ${imported}`);
    }
  }
}

assert.deepEqual(violations, [], violations.join('\n'));
assert.match(fs.readFileSync(path.join(src, 'main.jsx'), 'utf8'), /from ['"]\.\/app\/App\.jsx['"]/);
assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /"test:architecture"/);
assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /"test:acceptance"/);

console.log('Execution checklist passed: frozen modules, boundaries, verification scripts, and regression gates are present.');
