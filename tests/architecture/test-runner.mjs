import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const args = new Set(process.argv.slice(2));

function expectNo(file, patterns, label = file) {
  const source = read(file);
  for (const pattern of patterns) assert.doesNotMatch(source, pattern, label + ' contains forbidden dependency');
}
function expect(file, patterns, label = file) {
  const source = read(file);
  for (const pattern of patterns) assert.match(source, pattern, label + ' missing required contract');
}

expectNo('src/app/App.jsx', [/createPlaybackCore/, /sourceRuntimeService/]);
expectNo('src/pages/PlaybackPage.jsx', [/createPlaybackCore/]);
expectNo('src/features/movie/MovieFeature.jsx', [/createPlaybackCore/, /playbackService/, /usePersistentState/]);
expectNo('src/pages/MainPage.jsx', [/new Blob\(/, /FileReader/, /URL\.createObjectURL/, /document\.createElement/]);
expect('src/pages/MainPage.jsx', [/sourceConfigService/]);
expect('src/app/App.jsx', [/sourceManagementService/]);
expect('src/features/movie/MovieFeature.jsx', [/MoviePlaybackPage/]);
expect('src/services/sourceConfigService.js', [/importFile/, /download/]);
expect('src/services/sourceManagementService.js', [/setEnabled/, /setActive/, /remove/, /touchUsage/]);
expectNo('src/services/userDataService.js', [/sourceRepository/, /getSourceConfig/, /saveSourceConfig/, /touchSource/]);
expectNo('src/repositories/userDataRepository.js', [/getSourceConfig/, /saveSourceConfig/]);
expectNo('src/state/persistentStateStore.js', [/sourceRepository/, /saveSources\(/, /setSourceEnabled/, /setSourceActive/, /removeSource/]);
expect('src/features/movie/MoviePlaybackPage.jsx', [/playbackService\.createController/, /recordProgress/]);

const packageJson = JSON.parse(read('package.json'));
for (const script of ['test:live','test:playback','test:parser','test:player','test:state','test:movie','test:cache','test:errors','test:webview-runtime','test:performance','test:data-contract','test:acceptance','test:architecture','test:execution']) {
  assert.match(packageJson.scripts[script] ?? '', /tests\/architecture\/test-runner\.mjs/, 'missing test runner: ' + script);
}
assert.ok(packageJson.engines?.node, 'Node engine must be pinned');
assert.notEqual(packageJson.dependencies?.react, 'latest');
assert.notEqual(packageJson.dependencies?.vite, 'latest');
assert.notEqual(packageJson.dependencies?.['@vitejs/plugin-react'], 'latest');
assert.notEqual(packageJson.dependencies?.['lucide-react'], 'latest');

if (args.has('all') || args.size === 0) {
  console.log('Architecture/data-boundary static checks passed.');
}