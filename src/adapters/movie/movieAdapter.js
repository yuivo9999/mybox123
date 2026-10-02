import { parseJSONMovies } from './jsonParser.js';
import { normalizeMovie } from './normalizeMovie.js';

export function createMovieAdapter(config, transport = fetch) {
  const sourceId = config.sourceId;
  if (!sourceId) throw new Error('MOVIE_SOURCE_ID_REQUIRED');
  let snapshot = [];
  let lastError = null;

  const load = async () => {
    try {
      const response = await transport(config.sourceRef || config.url, { headers: config.headers ?? {} });
      if (!response?.ok) throw new Error(`HTTP_${response?.status ?? 0}`);
      const body = await response.text();
      const raw = parseJSONMovies(body);
      snapshot = raw.map((item, index) => normalizeMovie({ sourceId, item, index }));
      lastError = null;
      return snapshot;
    } catch (error) {
      lastError = { code: error?.message || 'MOVIE_ADAPTER_ERROR', sourceId };
      throw error;
    }
  };

  return {
    sourceId,
    getMovies: load,
    getCategories: async () => [...new Set((snapshot.length ? snapshot : await load()).map(item => item.category).filter(Boolean))],
    healthCheck: async () => ({ ok: !lastError, sourceId, error: lastError, checkedAt: Date.now() }),
  };
}
