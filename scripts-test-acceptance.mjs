import { spawnSync } from 'node:child_process';
import process from 'node:process';

const checks = [
  ['Architecture freeze', 'scripts-test-architecture-freeze.mjs'],
  ['Model / Utility Unit', 'scripts-test-data-contract.mjs'],
  ['Cache lifecycle', 'scripts-test-cache.mjs'],
  ['Error / fault isolation', 'scripts-test-errors.mjs'],
  ['Live adapter / service', 'scripts-test-live.mjs'],
  ['Playback integration', 'scripts-test-playback.mjs'],
  ['Parser integration', 'scripts-test-parser.mjs'],
  ['Player core', 'scripts-test-player-core.mjs'],
  ['State boundary', 'scripts-test-state.mjs'],
  ['Movie feature', 'scripts-test-movie-feature.mjs'],
  ['WebView runtime', 'scripts-test-webview-runtime.mjs'],
  ['Performance / resource lifecycle', 'scripts-test-performance.mjs'],
];

const failures = [];
for (const [layer, script] of checks) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 0) {
    failures.push({ layer, script, output });
    console.error(`[FAIL] ${layer} -> ${script}`);
    if (output) console.error(output);
  } else {
    console.log(`[PASS] ${layer} -> ${script}`);
  }
}

const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  encoding: 'utf8',
});
const buildOutput = [build.stdout, build.stderr].filter(Boolean).join('\n').trim();
if (build.status !== 0) {
  failures.push({ layer: 'Production build', script: 'vite build', output: buildOutput });
  console.error('[FAIL] Production build -> vite build');
  if (buildOutput) console.error(buildOutput);
} else {
  console.log('[PASS] Production build -> vite build');
}

console.log('');
console.log(`Acceptance summary: ${checks.length + 1 - failures.length}/${checks.length + 1} passed`);

if (failures.length > 0) {
  console.error(`Blocking failures: ${failures.length}`);
  process.exit(1);
}

console.log('P0/P1 automated regression gate passed');
