import { parseJSONMovies } from './jsonParser.js';
import { normalizeMovie } from './normalizeMovie.js';
import { ErrorCode, toAppError } from '../../models/errors.js';

const DEFAULT_CAPABILITIES = Object.freeze([
  'search',
  'categories',
  'list',
  'detail',
  'episodes',
  'playUrl',
]);

export function createMovieAdapter(config, transport = fetch) {
  const sourceId = String(config.sourceId ?? '').trim();
  if (!sourceId) throw new Error('MOVIE_SOURCE_ID_REQUIRED');

  const sourceDefinition = Object.freeze({
    sourceId,
    name: String(config.name ?? sourceId),
    type: 'movie',
    endpoint: String(config.sourceRef || config.url || '').trim(),
    enabled: config.enabled !== false,
    priority: Number.isFinite(Number(config.priority)) ? Number(config.priority) : 0,
    capabilities: [...new Set(Array.isArray(config.capabilities) && config.capabilities.length ? config.capabilities : DEFAULT_CAPABILITIES)],
  });

  let lastError = null;
  let lastCheckedAt = null;
  let status = 'unknown';

  const request = async (options = {}) => {
    if (!sourceDefinition.endpoint) {
      throw toAppError(new Error('MOVIE_SOURCE_ENDPOINT_REQUIRED'), {
        code: ErrorCode.SOURCE,
        scope: 'movie-source-request',
        context: { sourceId },
      });
    }

    let response;
    try {
      response = await transport(sourceDefinition.endpoint, {
        headers: config.headers ?? {},
        signal: options.signal,
      });
    } catch (error) {
      throw toAppError(error, {
        code: ErrorCode.NETWORK,
        retryable: true,
        scope: 'movie-source-request',
        context: { sourceId, endpoint: sourceDefinition.endpoint },
      });
    }

    if (!response?.ok) {
      throw toAppError(new Error(`HTTP_${response?.status ?? 0}`), {
        code: ErrorCode.SOURCE,
        scope: 'movie-source-response',
        context: { sourceId, status: response?.status ?? 0 },
      });
    }

    return response;
  };

  const load = async (options = {}) => {
    try {
      const response = await request(options);
      const body = await response.text();

      let raw;
      try {
        raw = parseJSONMovies(body);
      } catch (error) {
        throw toAppError(error, {
          code: ErrorCode.PARSE,
          scope: 'movie-source-parse',
          context: { sourceId },
        });
      }

      if (!Array.isArray(raw)) {
        throw toAppError(new Error('MOVIE_SOURCE_INVALID_RESULT'), {
          code: ErrorCode.PARSE,
          scope: 'movie-source-parse',
          context: { sourceId },
        });
      }

      if (!raw.length) {
        throw toAppError(new Error('MOVIE_SOURCE_EMPTY_RESULT'), {
          code: ErrorCode.SOURCE_EMPTY,
          scope: 'movie-source-empty',
          context: { sourceId },
        });
      }

      const normalized = raw.map((item, index) => {
        try {
          return normalizeMovie({ sourceId, item, index });
        } catch (error) {
          throw toAppError(error, {
            code: ErrorCode.NORMALIZE,
            scope: 'movie-source-normalize',
            context: { sourceId, sourceItemId: item?.sourceItemId ?? item?.id ?? null, index },
          });
        }
      });

      lastError = null;
      status = 'healthy';
      lastCheckedAt = Date.now();
      return normalized;
    } catch (error) {
      const normalized = toAppError(error, {
        context: { sourceId },
        scope: error?.scope ?? 'movie-source',
      });
      lastError = normalized;
      status = 'error';
      lastCheckedAt = Date.now();
      throw normalized;
    }
  };

  const ensureMovies = async (options = {}) => {
    if (Array.isArray(options.items)) return options.items;
    return load(options);
  };

  const requireCapability = (capability) => {
    if (!sourceDefinition.capabilities.includes(capability)) {
      throw toAppError(new Error(`MOVIE_CAPABILITY_UNSUPPORTED:${capability}`), {
        code: ErrorCode.SOURCE,
        scope: 'movie-source-capability',
        context: { sourceId, capability },
      });
    }
  };

  const getCategories = async (options = {}) => {
    requireCapability('categories');
    const movies = await ensureMovies(options);
    return [...new Set(movies.map(item => item.category).filter(Boolean))];
  };

  const getList = async (params = {}, options = {}) => {
    requireCapability('list');
    const movies = await ensureMovies(options);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 20));
    const category = String(params.category ?? '').trim();
    const filtered = category ? movies.filter(item => item.category === category) : movies;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: filtered.length,
    };
  };

  const search = async (params = {}, options = {}) => {
    requireCapability('search');
    const query = String(params.query ?? params.keyword ?? '').trim().toLowerCase();
    if (!query) return getList(params, options);
    const movies = await ensureMovies(options);
    const filtered = movies.filter(item => [item.title, item.subtitle, item.description, item.category].some(value => String(value ?? '').toLowerCase().includes(query)));
    return { ...await getList({ ...params, page: 1 }, { ...options, items: filtered }), items: filtered.slice(0, Math.max(1, Number(params.pageSize) || 20)), total: filtered.length };
  };

  const getDetail = async (contentRef, options = {}) => {
    requireCapability('detail');
    const movies = await ensureMovies(options);
    const ref = typeof contentRef === 'string' ? contentRef : contentRef?.contentId ?? contentRef?.sourceItemId;
    return movies.find(item => item.contentId === ref || item.legacyContentId === ref || item.sourceRefs?.some(source => source.sourceItemId === ref)) ?? null;
  };

  const getEpisodes = async (contentRef, options = {}) => {
    requireCapability('episodes');
    const detail = await getDetail(contentRef, options);
    return detail?.episodes ?? [];
  };

  const getPlaybackCandidates = async (episodeRef, options = {}) => {
    requireCapability('playUrl');
    const episodeId = typeof episodeRef === 'string' ? episodeRef : episodeRef?.episodeId;
    const movies = await ensureMovies(options);
    return movies.flatMap(item => item.episodes ?? []).find(episode => episode.episodeId === episodeId)?.playbackCandidates ?? [];
  };

  const healthCheck = async (options = {}) => {
    try {
      await load(options);
      return { ok: true, sourceId, status: 'healthy', checkedAt: lastCheckedAt, error: null };
    } catch (error) {
      return { ok: false, sourceId, status: 'error', checkedAt: lastCheckedAt, error: toAppError(error, { context: { sourceId } }) };
    }
  };

  return {
    sourceId,
    definition: sourceDefinition,
    getDefinition: () => sourceDefinition,
    getCapabilities: () => [...sourceDefinition.capabilities],
    getMovies: load,
    search,
    getCategories,
    getList,
    getDetail,
    getEpisodes,
    getPlaybackCandidates,
    healthCheck,
    getStatus: () => ({ status, lastCheckedAt, error: lastError }),
  };
}
