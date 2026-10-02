import assert from 'node:assert/strict';
import { ErrorCode, errorForUser, serializeError, toAppError } from './src/models/errors.js';
import { errorService } from './src/services/errorService.js';

const normalized = toAppError(new Error('network timeout'), {
  context: {
    scope: 'source',
    sourceId: 'source-a',
    token: 'secret-token',
    cookie: 'session-cookie',
  },
  retryable: true,
});

assert.equal(normalized.code, ErrorCode.NETWORK);
assert.equal(normalized.retryable, true);
assert.equal(normalized.context.token, '[redacted]');
assert.equal(normalized.context.cookie, '[redacted]');

const serialized = serializeError(normalized);
assert.equal(serialized.context.token, '[redacted]');
assert.equal(errorForUser(normalized).message, '操作失败，请稍后重试。');

let reported = null;
const unsubscribe = errorService.subscribe((payload) => { reported = payload; });
errorService.report(new Error('storage quota exceeded'), { scope: 'storage', key: 'favorites' });
unsubscribe();

assert.equal(reported.code, ErrorCode.STORAGE);
assert.equal(reported.context.scope, 'storage');

console.log('Error model and fault isolation tests passed');
