import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('src/app/App.jsx');
assert.match(app, /playbackService/);
assert.doesNotMatch(app, /createPlaybackCore/);

const playbackPage = read('src/pages/PlaybackPage.jsx');
const movieFeature = read('src/features/movie/MovieFeature.jsx');
assert.doesNotMatch(playbackPage, /createPlaybackCore/);
assert.doesNotMatch(movieFeature, /createPlaybackCore/);

console.log('React page/feature playback boundary checks passed.');
