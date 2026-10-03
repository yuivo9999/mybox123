import { createTVBoxJarRuntime } from './tvboxJarRuntime.js';
import { parseTVBoxResult } from '../movie/jsonParser.js';
import { normalizeMovie } from '../movie/normalizeMovie.js';

export function createTVBoxJarAdapter(config = {}, runtime = null) {
  const effectiveRuntime = runtime ?? createTVBoxJarRuntime();
  const sourceId = String(config.sourceId || '').trim();
  if (!sourceId) throw new Error('TVBOX_JAR_SOURCE_ID_REQUIRED');

  const definition = Object.freeze({
    sourceId,
    name: String(config.name || sourceId),
    sourceType: String(config.sourceType || 'movie'),
    kind: 'jar',
    tvboxJar: config.tvboxJar ?? null,
    tvboxDefinition: config.tvboxDefinition ?? null,
  });

  const execute = async (operation, payload = {}) => {
    if (!effectiveRuntime?.isAvailable?.()) {
      throw new Error('TVBOX_JAR_RUNTIME_UNAVAILABLE');
    }
    return effectiveRuntime.execute({ operation, payload });
  };

  let preparedPath = '';
  const prepare = async (payload = {}) => {
    const jar = definition.tvboxJar;
    const jarUrl = typeof jar === 'string'
      ? jar
      : (jar && typeof jar === 'object' ? (jar.url || jar.path || '') : '');
    const jarMd5 = typeof jar === 'object' && jar ? (jar.md5 || '') : '';
    return execute('prepare', {
      ...payload,
      name: payload.name || definition.name,
      url: payload.url || jarUrl,
      md5: payload.md5 || jarMd5,
    });
  };

  const inspect = async (payload = {}) => execute('inspect', payload);

  const ensurePrepared = async (payload = {}) => {
    if (payload.path) return payload.path;
    if (preparedPath) return preparedPath;
    const result = await prepare(payload);
    preparedPath = String(result?.path || '');
    if (!preparedPath) throw new Error('TVBOX_JAR_PREPARE_PATH_MISSING');
    return preparedPath;
  };

  const invoke = async (operation, payload = {}) => execute(operation, {
    ...payload,
    path: payload.path || preparedPath || '',
    className: payload.className || '',
    ext: payload.ext ?? definition.tvboxDefinition?.ext ?? '',
  });

  const home = async (payload = {}) => invoke('home', { ...payload, path: await ensurePrepared(payload) });
  const category = async (payload = {}) => invoke('category', { ...payload, path: await ensurePrepared(payload) });
  const detail = async (payload = {}) => invoke('detail', { ...payload, path: await ensurePrepared(payload) });
  const search = async (payload = {}) => invoke('search', { ...payload, path: await ensurePrepared(payload) });
  const play = async (payload = {}) => invoke('play', { ...payload, path: await ensurePrepared(payload) });

  const normalizePlaybackResult = (result, fallback = {}) => {
    const raw = result?.result ?? result;
    const first = Array.isArray(raw) ? raw[0] : raw;
    const object = first && typeof first === 'object' ? first : {};
    const mediaUrl = String(object.url ?? object.playUrl ?? object.play_url ?? (typeof first === 'string' ? first : '')).trim();
    if (!mediaUrl) return null;
    const rawHeaders = object.headers ?? object.header ?? {};
    const headers = typeof rawHeaders === 'string' ? { 'X-TVBox-Header': rawHeaders } : { ...rawHeaders };
    const userAgent = object.userAgent ?? object['user-agent'] ?? headers['User-Agent'] ?? headers['user-agent'] ?? '';
    const referer = object.referer ?? object.Referer ?? headers.Referer ?? headers.referer ?? '';
    const cookie = object.cookie ?? object.Cookie ?? headers.Cookie ?? headers.cookie ?? '';
    return { ...fallback, mediaUrl, headers, userAgent, referer, cookies: cookie,
      parserHint: object.parse ? { parse: object.parse, jx: object.jx } : fallback.parserHint,
      metadata: { ...(fallback.metadata ?? {}), tvboxPlayFlag: object.flag ?? fallback.metadata?.tvboxPlayFlag ?? '', tvboxJx: object.jx ?? false, tvboxParse: object.parse ?? false } };
  };

  const resolvePlaybackCandidates = async (items) => {
    const output = [];
    for (const item of items) {
      const episodes = [];
      for (const episode of item.episodes ?? []) {
        const candidates = [];
        for (const candidate of episode.playbackCandidates ?? []) {
          const url = String(candidate.mediaUrl ?? candidate.url ?? '').trim();
          if (/^https?:\/\//i.test(url)) { candidates.push(candidate); continue; }
          try {
            const result = await play({ flag: candidate.metadata?.tvboxPlayFlag ?? candidate.label ?? '', id: url, vipFlags: candidate.metadata?.tvboxVipFlags ?? [] });
            candidates.push(normalizePlaybackResult(result, candidate) || candidate);
          } catch { candidates.push(candidate); }
        }
        episodes.push({ ...episode, playbackCandidates: candidates });
      }
      output.push({ ...item, episodes });
    }
    return output;
  };

  const normalizeResult = async (result) => {
    const raw = result?.result ?? result;
    const items = parseTVBoxResult(raw);
    const normalized = items.map((item, index) => normalizeMovie({
      sourceId,
      item,
      index,
      sourceMetadata: {
        sourceCapability: 'tvbox-jar',
        adapterType: 'tvbox-extension',
        tvboxAdapterKind: 'jar',
        tvboxRequiresJar: true,
        tvboxJar: definition.tvboxJar,
      },
    }));
    return resolvePlaybackCandidates(normalized);
  };

  const getMovies = async (payload = {}) => normalizeResult(await home(payload));
  const searchMovies = async (payload = {}) => normalizeResult(await search(payload));
  const getCategory = async (payload = {}) => normalizeResult(await category(payload));
  const getDetail = async (payload = {}) => normalizeResult(await detail(payload));

  return {
    sourceId,
    definition,
    isRuntimeAvailable: () => Boolean(effectiveRuntime?.isAvailable?.()),
    getCapabilities: () => effectiveRuntime?.getCapabilities?.() || { available: false },
    getDefinition: () => ({ ...definition, status: 'runtime' }),
    getStatus: () => ({ status: 'runtime', error: null }),
    prepare,
    inspect,
    invoke,
    home,
    category,
    detail,
    search,
    play,
    normalizeResult,
    getMovies,
    searchMovies,
    getCategory,
    getDetail,
    execute,
  };
}
