import assert from 'node:assert/strict';
import { movieService } from './src/services/movieService.js';

const movies = [
  { contentId: 'content:demo:1', title: 'Alpha', description: 'space', category: '科幻', episodes: [{ episodeId: 'e1', title: '第1集' }] },
  { contentId: 'content:demo:2', title: 'Beta', description: 'crime', category: '犯罪', episodes: [{ episodeId: 'e2', title: '第1集' }, { episodeId: 'e3', title: '第2集' }] },
];

const list = movieService.list({ movies, category: '全部', page: 1, pageSize: 1 });
assert.equal(list.items.length, 1);
assert.equal(list.total, 2);
assert.equal(list.hasMore, true);

assert.equal(movieService.search({ movies, keyword: 'alpha' })[0].contentId, 'content:demo:1');
assert.equal(movieService.getDetail({ movies, contentId: 'content:demo:2' }).title, 'Beta');
assert.equal(movieService.getEpisode({ movies, contentId: 'content:demo:2', episodeId: 'e3' }).title, '第2集');

const home = movieService.getHome({
  movies,
  history: [{ historyId: 'h1', targetId: 'content:demo:2', episodeId: 'e3' }],
});
assert.equal(home.continueWatching[0].episodeIndex, 1);

console.log('movie feature service tests passed');
