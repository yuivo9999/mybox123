import { requestAdapter } from '../../services/requestAdapter.js';
import { parseTVBoxResult } from '../movie/jsonParser.js';
import { normalizeMovie } from '../movie/normalizeMovie.js';

const MAX_EXT_JSON_CHARS = 5 * 1024 * 1024;

export function createTVBoxExtJsonAdapter(config = {}, transport = null) {
  const sourceId = String(config.sourceId || '').trim();
  if (!sourceId) throw new Error('TVBOX_EXT_SOURCE_ID_REQUIRED');
  const ext = config.tvboxExt;
  const definition = Object.freeze({ sourceId, name: String(config.name || sourceId), sourceType: String(config.sourceType || 'movie'), sourceCapability: 'tvbox-ext-json', adapterType: 'tvbox-extension', kind: 'ext', tvboxExt: ext ?? null });
  const resolveUrl = () => { if (typeof ext !== 'string') return ''; const value = ext.trim(); return /^https?:\/\//i.test(value) ? value : ''; };
  const load = async (options = {}) => {
    const url = resolveUrl(); if (!url) throw new Error('TVBOX_EXT_JSON_URL_REQUIRED');
    const response = await requestAdapter.request(url, { headers: config.headers ?? {}, signal: options.signal, timeoutMs: options.timeoutMs ?? config.timeoutMs, transport });
    if (!response?.ok) throw new Error('TVBOX_EXT_JSON_HTTP_' + String(response?.status ?? 0));
    const body = String(await response.text()).replace(/^\uFEFF/, '').trim();
    if (!body) throw new Error('TVBOX_EXT_JSON_EMPTY');
    if (body.length > MAX_EXT_JSON_CHARS) throw new Error('TVBOX_EXT_JSON_TOO_LARGE');
    let parsed; try { parsed = JSON.parse(body); } catch { throw new Error('TVBOX_EXT_JSON_INVALID'); }
    const raw = parseTVBoxResult(parsed);
    return raw.map((item, index) => normalizeMovie({ sourceId, item, index, sourceMetadata: { sourceCapability: definition.sourceCapability, adapterType: definition.adapterType, tvboxAdapterKind: 'ext', headers: config.headers, userAgent: config.userAgent, referer: config.referer, cookies: config.cookies } }));
  };
  const findDetail = async (ref, options = {}) => { const movies = await load(options); const id = typeof ref === 'string' ? ref : ref?.contentId ?? ref?.sourceItemId; return movies.find(item => item.contentId === id || item.legacyContentId === id || item.sourceRefs?.some(r => r.sourceItemId === id)) ?? null; };
  return {
    sourceId, definition, getDefinition: () => definition, getCapabilities: () => ['list','search','detail','episodes','playUrl'],
    getStatus: () => ({ status: 'ready', error: null }), isRuntimeAvailable: () => Boolean(resolveUrl()),
    healthCheck: async (options = {}) => { try { await load(options); return { ok: true, sourceId, status: 'healthy', checkedAt: Date.now(), error: null }; } catch (error) { return { ok: false, sourceId, status: 'error', checkedAt: Date.now(), error }; } },
    getMovies: load,
    getList: async (params = {}, options = {}) => { const movies = await load(options); const page = Math.max(1, Number(params.page) || 1); const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 20)); return { items: movies.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: movies.length }; },
    search: async (params = {}, options = {}) => { const query = String(params.query ?? params.keyword ?? '').trim().toLowerCase(); const movies = await load(options); const filtered = query ? movies.filter(item => [item.title,item.subtitle,item.description,item.category].some(v => String(v ?? '').toLowerCase().includes(query))) : movies; const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 20)); return { items: filtered.slice(0, pageSize), page: 1, pageSize, total: filtered.length }; },
    getDetail: findDetail,
    getEpisodes: async (ref, options = {}) => (await findDetail(ref, options))?.episodes ?? [],
    getPlaybackCandidates: async (episodeRef, options = {}) => { const movies = await load(options); const id = typeof episodeRef === 'string' ? episodeRef : episodeRef?.episodeId; return movies.flatMap(item => item.episodes ?? []).find(ep => ep.episodeId === id)?.playbackCandidates ?? []; },
  };
}