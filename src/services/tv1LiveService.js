import { requestAdapter } from './requestAdapter.js';
import { parseTXTLive } from '../adapters/live/txtParser.js';
import { normalizeLiveChannel } from '../adapters/live/normalizeLive.js';

function isTv1Source(source) {
  return source?.sourceType === 'live' && source?.liveMode === 'tv1';
}

export const tv1LiveService = {
  isSupportedSource: isTv1Source,

  async load(source, options = {}) {
    if (!isTv1Source(source)) throw new Error('TV1_SOURCE_REQUIRED');
    const response = source.localContent != null
      ? { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => String(source.localContent) }
      : await requestAdapter.request(source.sourceRef || source.url, {
          headers: source.headers ?? {},
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          transport: options.transport,
        });

    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = await response.text();
    const raw = parseTXTLive(body);
    if (!raw.length) throw new Error('TV1_SOURCE_EMPTY');

    return raw.map((item, index) => normalizeLiveChannel({
      sourceId: source.sourceId,
      item,
      index,
      capabilities: { search: true, categories: true, multiStream: true, epg: false, currentProgram: false, upcomingProgram: false },
    })).filter(channel => channel.streams.length);
  },

  async healthCheck(source, options = {}) {
    try {
      await this.load(source, options);
      return { ok: true, sourceId: source.sourceId, status: 'healthy', checkedAt: Date.now(), error: null };
    } catch (error) {
      return { ok: false, sourceId: source.sourceId, status: 'error', checkedAt: Date.now(), error };
    }
  },
};
