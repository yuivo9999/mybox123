import { ErrorCode } from '../models/errors.js';
import { errorService } from '../services/errorService.js';

const CACHE_PREFIX = 'tvbox:cache:v1:';
const CACHE_VERSION = 1;

export const CacheNamespace = Object.freeze({
  SOURCE: 'source',
  MOVIE: 'movie',
  DETAIL: 'detail',
  EPISODE: 'episode',
  LIVE_CHANNEL: 'live-channel',
  EPG: 'epg',
  IMAGE: 'image',
  PLAYBACK_TEMP: 'playback-temp',
});

export const CacheTTL = Object.freeze({
  [CacheNamespace.SOURCE]: 6 * 60 * 60 * 1000,
  [CacheNamespace.MOVIE]: 30 * 60 * 1000,
  [CacheNamespace.DETAIL]: 6 * 60 * 60 * 1000,
  [CacheNamespace.EPISODE]: 6 * 60 * 60 * 1000,
  [CacheNamespace.LIVE_CHANNEL]: 5 * 60 * 1000,
  [CacheNamespace.EPG]: 2 * 60 * 1000,
  [CacheNamespace.IMAGE]: 24 * 60 * 60 * 1000,
  [CacheNamespace.PLAYBACK_TEMP]: 5 * 60 * 1000,
});

const MAX_ENTRIES_PER_NAMESPACE = 100;
const MAX_SERIALIZED_BYTES_PER_ENTRY = 512 * 1024;
const ACCESS_WRITE_INTERVAL = 30 * 1000;

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

export function createCacheKey({ namespace, sourceId = '', contentId = '', params = {}, version = CACHE_VERSION } = {}) {
  if (!namespace) throw new Error('CACHE_NAMESPACE_REQUIRED');
  return `${namespace}:v${version}:s=${String(sourceId)}:c=${String(contentId)}:p=${encodeURIComponent(stable(params))}`;
}

function storageKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

function listKeys(namespace) {
  const prefix = `${CACHE_PREFIX}${namespace}:`;
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function removeStorageKey(key) {
  window.localStorage.removeItem(key);
}

function prune(namespace) {
  const entries = listKeys(namespace).map((key) => {
    try {
      const value = JSON.parse(window.localStorage.getItem(key));
      return { key, createdAt: Number(value?.createdAt) || 0, expiresAt: Number(value?.expiresAt) || 0, size: String(window.localStorage.getItem(key) ?? '').length };
    } catch {
      return { key, createdAt: 0, expiresAt: 0, size: 0 };
    }
  });

  const now = Date.now();
  entries.filter((entry) => entry.expiresAt > 0 && entry.expiresAt <= now).forEach((entry) => removeStorageKey(entry.key));
  const remaining = entries
    .filter((entry) => !(entry.expiresAt > 0 && entry.expiresAt <= now))
    .sort((a, b) => (a.lastAccessedAt || a.createdAt) - (b.lastAccessedAt || b.createdAt));

  while (remaining.length > MAX_ENTRIES_PER_NAMESPACE) {
    removeStorageKey(remaining.shift().key);
  }
}

function set(namespace, key, value, { ttl = CacheTTL[namespace] } = {}) {
  const serializedValue = JSON.stringify(value);
  if (serializedValue === undefined) throw errorService.normalize(new Error('CACHE_SERIALIZE_FAILED'), { code: ErrorCode.STORAGE, context: { scope: 'cache-write', namespace, key } });
  if (serializedValue.length > MAX_SERIALIZED_BYTES_PER_ENTRY) throw errorService.normalize(new Error('CACHE_ENTRY_TOO_LARGE'), { code: ErrorCode.STORAGE, context: { scope: 'cache-write', namespace, key } });

  const now = Date.now();
  const entry = {
    version: CACHE_VERSION,
    namespace,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: ttl == null ? 0 : now + Math.max(0, ttl),
    value,
  };
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch (error) {
    throw errorService.normalize(error, { code: ErrorCode.STORAGE, context: { scope: 'cache-write', namespace, key } });
  }
  prune(namespace);
  return value;
}

function get(namespace, key, { allowStale = false } = {}) {
  const raw = window.localStorage.getItem(storageKey(key));
  if (raw === null) return { value: null, hit: false, stale: false };

  try {
    const entry = JSON.parse(raw);
    const now = Date.now();
    const stale = entry.expiresAt > 0 && entry.expiresAt <= now;
    if (stale && !allowStale) {
      removeStorageKey(storageKey(key));
      return { value: null, hit: false, stale: true };
    }
    if (now - (Number(entry.lastAccessedAt) || 0) >= ACCESS_WRITE_INTERVAL) {
      entry.lastAccessedAt = now;
      window.localStorage.setItem(storageKey(key), JSON.stringify(entry));
    }
    return { value: entry.value, hit: true, stale };
  } catch {
    removeStorageKey(storageKey(key));
    return { value: null, hit: false, stale: false };
  }
}

function remove(namespace, key) {
  window.localStorage.removeItem(storageKey(key));
  return true;
}

function clear(namespace) {
  listKeys(namespace).forEach(removeStorageKey);
}

function clearAll() {
  Object.values(CacheNamespace).forEach(clear);
}

function stats() {
  return Object.values(CacheNamespace).reduce((result, namespace) => {
    const keys = listKeys(namespace);
    result[namespace] = { entries: keys.length };
    return result;
  }, {});
}

export const cacheStorage = Object.freeze({
  prefix: CACHE_PREFIX,
  version: CACHE_VERSION,
  createKey: createCacheKey,
  get,
  set,
  remove,
  clear,
  clearAll,
  prune,
  stats,
});
