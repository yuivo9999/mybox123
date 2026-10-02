import assert from 'node:assert/strict';
import { sessionStateStore } from './src/state/sessionStateStore.js';

const initial = sessionStateStore.getSnapshot();
assert.deepEqual(initial, { tab: 'home', route: null, selected: null });

let notifications = 0;
const unsubscribe = sessionStateStore.subscribe(() => { notifications += 1; });
sessionStateStore.patch({ tab: 'movies', route: 'detail', selected: { contentId: 'c1' } });
assert.equal(sessionStateStore.getSnapshot().tab, 'movies');
assert.equal(sessionStateStore.getSnapshot().route, 'detail');
assert.equal(sessionStateStore.getSnapshot().selected.contentId, 'c1');
assert.equal(notifications, 1);

sessionStateStore.reset();
assert.deepEqual(sessionStateStore.getSnapshot(), { tab: 'home', route: null, selected: null });
assert.equal(notifications, 2);
unsubscribe();

console.log('State boundary tests passed');
