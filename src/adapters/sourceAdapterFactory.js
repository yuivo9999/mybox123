import { createMovieAdapter } from './movie/movieAdapter.js';
import { createTVBoxExtensionAdapter } from './tvbox/tvboxExtensionAdapter.js';
import { createTVBoxJarAdapter } from './tvbox/tvboxJarAdapter.js';
import { createTVBoxExtJsonAdapter } from './tvbox/tvboxExtJsonAdapter.js';

export const SOURCE_ADAPTER_TYPE = Object.freeze({
  HTTP_VOD: 'http-vod',
  TVBOX_EXTENSION: 'tvbox-extension',
  LIVE_REFERENCE: 'live-reference',
  TVBOX_LIVE_EXTENSION: 'tvbox-live-extension',
});

function isSafeExtJsonSource(source) {
  if (source?.tvboxAdapterKind !== 'ext') return false;
  if (source?.tvboxExt && typeof source.tvboxExt === 'object' && !Array.isArray(source.tvboxExt)) return true;
  if (typeof source?.tvboxExt !== 'string') return false;
  const value = source.tvboxExt.trim();
  return /^https?:\/\//i.test(value) && /\.json(?:[?#].*)?$/i.test(value);
}

export function createSourceAdapter(source, options = {}) {
  if (!source || typeof source !== 'object') throw new Error('SOURCE_ADAPTER_SOURCE_REQUIRED');

  const adapterType = String(source.adapterType || '').trim();
  const sourceType = source.sourceType === 'live' ? 'live' : 'movie';

  if (sourceType === 'movie' && adapterType === SOURCE_ADAPTER_TYPE.TVBOX_EXTENSION) {
    if (source.tvboxAdapterKind === 'jar' || source.sourceCapability === 'tvbox-jar' || source.sourceCapability === 'tvbox-http-vod-with-jar') {
      return createTVBoxJarAdapter(source, options.jarRuntime);
    }
    if (isSafeExtJsonSource(source)) {
      return createTVBoxExtJsonAdapter(source, options.transport ?? null);
    }
    return createTVBoxExtensionAdapter(source, options.runtime);
  }

  if (sourceType === 'movie' && (adapterType === SOURCE_ADAPTER_TYPE.HTTP_VOD || !adapterType)) {
    return createMovieAdapter(source, options.transport ?? null);
  }

  if (sourceType === 'live' && adapterType === SOURCE_ADAPTER_TYPE.TVBOX_LIVE_EXTENSION) {
    throw new Error('TVBOX_LIVE_EXTENSION_RUNTIME_NOT_READY');
  }

  if (sourceType === 'live' && adapterType === SOURCE_ADAPTER_TYPE.LIVE_REFERENCE) {
    throw new Error('LIVE_REFERENCE_ADAPTER_USE_LIVE_SERVICE');
  }

  throw new Error(`SOURCE_ADAPTER_UNSUPPORTED:${adapterType || 'unknown'}`);
}

export function createSourceAdapters(sources = [], options = {}) {
  const adapters = [];
  const unsupported = [];

  for (const source of Array.isArray(sources) ? sources : []) {
    if (source?.enabled === false) continue;
    try {
      adapters.push(createSourceAdapter(source, options));
    } catch (error) {
      unsupported.push({
        sourceId: source?.sourceId ?? null,
        name: source?.name ?? '',
        adapterType: source?.adapterType ?? null,
        sourceCapability: source?.sourceCapability ?? null,
        error,
      });
    }
  }

  return { adapters, unsupported };
}
