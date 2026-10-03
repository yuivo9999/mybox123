import { parseJSONLive } from './jsonParser.js';
import { parseM3U } from './m3uParser.js';
import { parseXMLLive, parseXMLEPG } from './xmlParser.js';
import { parseTXTLive, isTXTGenreFormat } from './txtParser.js';
import { normalizeLiveChannel } from './normalizeLive.js';
import { defaultLiveCapabilities, normalizeLiveCapabilities } from './liveCapabilities.js';
import { requestAdapter } from '../../services/requestAdapter.js';

export function createLiveAdapter(config, transport = null) {
  const sourceId = config.sourceId;
  let snapshot = [];
  let lastSuccessfulSnapshot = [];
  let lastError = null;
  let lastAttemptAt = null;
  let lastSuccessfulAt = null;
  let capabilities = normalizeLiveCapabilities({
    ...defaultLiveCapabilities,
    ...(config.capabilities ?? {}),
    search: Boolean(config.capabilities?.search),
  });

  const load = async (options = {}) => {
    lastAttemptAt = Date.now();
    try {
      const response = await requestAdapter.request(config.sourceRef, {
        headers: config.headers ?? {},
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        transport,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const body = await response.text();
      const format = detectFormat(config.format, response.headers?.get?.('content-type') || '', body);
      if (format === 'xml' && config.capabilities?.epg === undefined) capabilities = normalizeLiveCapabilities({ ...capabilities, epg: true, currentProgram: true, upcomingProgram: true });
      const raw = format === 'm3u'
        ? parseM3U(body)
        : format === 'xml'
        ? parseXMLLive(body)
        : format === 'txt'
        ? parseTXTLive(body)
        : parseJSONLive(body);
      const epgPrograms = format === 'xml' ? parseXMLEPG(body) : [];
      const withEPG = raw.map((item) => ({
        ...item,
        epg: [...(item.epg ?? []), ...epgPrograms.filter((program) => program.channelRef === item.sourceItemId || program.channelRef === item.channelKey)],
      }));
      const normalized = withEPG.map((item, index) => normalizeLiveChannel({ sourceId, item, index, capabilities }));
      snapshot = normalized;
      lastSuccessfulSnapshot = normalized;
      lastSuccessfulAt = Date.now();
      lastError = null;
      return normalized;
    } catch (error) {
      lastError = { code: error?.message || 'LIVE_ADAPTER_ERROR', sourceId, at: Date.now() };
      throw error;
    }
  };

  const current = () => snapshot.length ? snapshot : lastSuccessfulSnapshot;

  return {
    sourceId,
    capabilities,
    getChannels: load,
    getCategories: async () => [...new Set(current().map((channel) => channel.category))],
    getStreams: async (channelRef) => {
      const channels = current();
      const sourceRef = channelRef?.sourceRefs?.find((ref) => ref.sourceId === sourceId);
      const channel = channels.find((item) => item.channelId === channelRef?.channelId || item.sourceRefs?.some((ref) => ref.sourceChannelId === sourceRef?.sourceChannelId));
      return channel?.streams ?? [];
    },
    getEPG: async (channelRef, range = {}) => {
      const channels = current();
      const sourceRef = channelRef?.sourceRefs?.find((ref) => ref.sourceId === sourceId);
      const channel = channels.find((item) => item.channelId === channelRef?.channelId || item.sourceRefs?.some((ref) => ref.sourceChannelId === sourceRef?.sourceChannelId));
      return (channel?.epg ?? []).filter((program) => (!range.startAt || program.endAt >= range.startAt) && (!range.endAt || program.startAt <= range.endAt));
    },
    getSnapshotState: () => ({
      lastAttemptAt,
      lastSuccessfulAt,
      stale: Boolean(lastSuccessfulSnapshot.length && lastError),
      lastError,
    }),
    healthCheck: async (options = {}) => {
      try {
        await load(options);
        return { ok: true, sourceId, status: 'healthy', checkedAt: Date.now(), error: null };
      } catch (error) {
        return { ok: false, sourceId, status: 'error', checkedAt: Date.now(), error };
      }
    },
  };
}

function detectFormat(explicit, contentType = '', body = '') {
  if (explicit) return explicit;
  const trimmed = String(body || '').trim();
  if (/mpegurl|m3u/i.test(contentType) || /^#EXTM3U/i.test(trimmed)) return 'm3u';
  if (/xml/i.test(contentType) || /^<\?xml|^<tv[\s>]/i.test(trimmed)) return 'xml';
  if (/#genre#/i.test(trimmed) || isTXTGenreFormat(trimmed)) return 'txt';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return isTXTGenreFormat(trimmed) ? 'txt' : 'json';
}
