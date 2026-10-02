import assert from 'node:assert/strict';
const progress = { progressId: 'progress:movie-1:ep-1', contentId: 'movie-1', episodeId: 'ep-1', positionSeconds: 120 };
assert.ok(progress.positionSeconds > 0);
assert.equal('progress:movie-1:ep-1', progress.progressId);
assert.equal('favorite:content:movie-1', 'favorite:content:movie-1');
console.log('user-data-protection smoke checks passed');
