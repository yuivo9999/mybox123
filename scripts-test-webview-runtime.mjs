import assert from 'node:assert/strict';
import { webViewRuntime } from './src/runtime/webViewRuntime.js';

assert.equal(webViewRuntime.version, 1);
assert.equal(typeof webViewRuntime.call, 'function');
assert.equal(typeof webViewRuntime.mount, 'function');
assert.equal(webViewRuntime.capabilities.webView, false);
assert.equal(webViewRuntime.getAppState(), 'unknown');

console.log('webview runtime smoke checks passed');
