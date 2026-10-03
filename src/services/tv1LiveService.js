import { requestAdapter } from './requestAdapter.js';
import { parseTXTLiveMetadata, parseTXTLiveLineStreams } from '../adapters/live/txtParser.js';
import { normalizeLiveChannel } from '../adapters/live/normalizeLive.js';

function isTv1Source(source) {
  return source?.sourceType === 'live' && source?.liveMode === 'tv1';
}

const sessions = new Map();

async function fetchBody(source, options = {}) {
  const response = source.localContent != null
    ? { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => String(source.localContent) }
    : await requestAdapter.request(source.sourceRef || source.url, {
        headers: source.headers ?? {},
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        transport: options.transport,
      });
  if (!response.ok) throw new Error('HTTP_' + response.status);
  return response.text();
}

function createSession(source, body) {
  const lines = String(body).replace(/^\uFEFF/, '').split(/\r?\n/);
  const metadata = parseTXTLiveMetadata(body);
  const session = { sourceId: source.sourceId, lines, metadata, createdAt: Date.now() };
  sessions.set(source.sourceId, session);
  return session;
}

export const tv1LiveService = {
  isSupportedSource: isTv1Source,

  async loadMetadata(source, options = {}) {
    if (!isTv1Source(source)) throw new Error('TV1_SOURCE_REQUIRED');
    const body = await fetchBody(source, options);
    const session = createSession(source, body);
    const capabilities = { search: true, categories: true, multiStream: true, epg: false, currentProgram: false, upcomingProgram: false };
    const result = [];
    for (const item of session.metadata) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      result.push(normalizeLiveChannel({
        sourceId: source.sourceId,
        item,
        index: result.length,
        capabilities,
      }));
      if (typeof options.onChannel === 'function') {
        options.onChannel(result[result.length - 1]);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return result;
  },

  async getStreams(source, channelRef, options = {}) {
    if (!isTv1Source(source)) throw new Error('TV1_SOURCE_REQUIRED');
    const session = sessions.get(source.sourceId);
    if (!session) await this.loadMetadata(source, options);
    const activeSession = sessions.get(source.sourceId);
    const lineIndex = channelRef?.deferredRef?.lineIndex;
    if (!Number.isInteger(lineIndex)) return [];
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const streams = parseTXTLiveLineStreams(activeSession.lines[lineIndex]);
    return streams.map((stream, index) => ({
      ...stream,
      streamId: 'stream:' + source.sourceId + ':' + channelRef.sourceItemId + ':' + (index + 1),
      sourceId: source.sourceId,
      sourceChannelId: source.sourceId + ':' + channelRef.sourceItemId,
      sourceItemId: channelRef.sourceItemId,
      protocol: /\.m3u8(?:[?#]|$)/i.test(stream.url) ? 'hls' : 'http',
      priority: index,
      status: 'unknown',
      lastCheckedAt: null,
      failureCode: null,
      failureCount: 0,
      updatedAt: Date.now(),
    }));
  },

  async load(source, options = {}) {
    return this.loadMetadata(source, options);
  },

  async healthCheck(source, options = {}) {
    try {
      const channels = await this.loadMetadata(source, options);
      return { ok: channels.length > 0, sourceId: source.sourceId, status: channels.length ? 'healthy' : 'empty', checkedAt: Date.now(), error: null };
    } catch (error) {
      return { ok: false, sourceId: source.sourceId, status: 'error', checkedAt: Date.now(), error };
    }
  },

  clear(sourceId = null) {
    if (sourceId) sessions.delete(sourceId);
    else sessions.clear();
  },
};
