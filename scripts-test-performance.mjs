import assert from 'node:assert/strict';
import { createRequestManager } from './src/services/requestManager.js';

const manager = createRequestManager({ concurrency: 2 });
let active = 0;
let maxActive = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (key, ms) => manager.run(key, async () => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await wait(ms);
  active -= 1;
  return key;
});

const [a, b, c] = await Promise.all([
  run('a', 10),
  run('b', 10),
  run('c', 10),
]);

assert.deepEqual([a, b, c], ['a', 'b', 'c']);
assert.equal(maxActive, 2);

const sharedA = manager.run('shared', async () => {
  await wait(5);
  return 42;
});
assert.strictEqual(sharedA, manager.run('shared', async () => 99));
assert.equal(await sharedA, 42);

console.log('performance request lifecycle checks passed');
