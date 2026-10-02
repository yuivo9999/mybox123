import { ErrorCode, errorForUser, serializeError, toAppError } from '../models/errors.js';

const listeners = new Set();

export const errorService = {
  normalize(error, options = {}) {
    return toAppError(error, options);
  },

  userMessage(error, fallback) {
    return errorForUser(toAppError(error), fallback).message;
  },

  report(error, context = {}) {
    const payload = serializeError(toAppError(error, { context }));
    listeners.forEach((listener) => listener(payload));
    return payload;
  },

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  classifyNetwork(error, context = {}) {
    return toAppError(error, { code: ErrorCode.NETWORK, context, retryable: true, scope: context.scope ?? 'network' });
  },

  classifySource(error, context = {}) {
    const normalized = toAppError(error, { context, scope: context.scope ?? 'source' });
    if (normalized.code === ErrorCode.NETWORK) {
      return toAppError(error, { code: ErrorCode.NETWORK, context, retryable: true, scope: context.scope ?? 'network' });
    }
    return toAppError(error, { code: ErrorCode.SOURCE, context, scope: context.scope ?? 'source' });
  },
};
