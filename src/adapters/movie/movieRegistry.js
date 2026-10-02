export function normalizeMovieSourceDefinition(source = {}) {
  const sourceId = String(source.sourceId ?? '').trim();
  if (!sourceId) throw new Error('MOVIE_SOURCE_ID_REQUIRED');

  return {
    sourceId,
    name: String(source.name ?? sourceId).trim() || sourceId,
    type: 'movie',
    endpoint: String(source.sourceRef || source.url || '').trim(),
    enabled: source.enabled !== false,
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    capabilities: Array.isArray(source.capabilities) ? [...new Set(source.capabilities.filter(Boolean))] : [],
    status: String(source.status ?? 'unknown'),
    lastCheckedAt: source.lastCheckedAt ?? null,
  };
}

export function createMovieRegistry() {
  const adapters = new Map();
  const definitions = new Map();

  return {
    register(adapter) {
      if (!adapter?.sourceId) throw new Error('MOVIE_ADAPTER_SOURCE_ID_REQUIRED');
      adapters.set(adapter.sourceId, adapter);
      definitions.set(adapter.sourceId, normalizeMovieSourceDefinition({
        ...adapter.getDefinition?.(),
        capabilities: adapter.getCapabilities?.(),
      }));
      return adapter;
    },
    unregister(sourceId) {
      adapters.delete(sourceId);
      definitions.delete(sourceId);
    },
    get(sourceId) {
      return adapters.get(sourceId) ?? null;
    },
    getDefinition(sourceId) {
      return definitions.get(sourceId) ?? null;
    },
    getCapabilities(sourceId) {
      return [...(definitions.get(sourceId)?.capabilities ?? [])];
    },
    list() {
      return [...adapters.values()].sort((a, b) => (a.getDefinition?.().priority ?? 0) - (b.getDefinition?.().priority ?? 0));
    },
    listDefinitions() {
      return [...definitions.values()];
    },
    clear() {
      adapters.clear();
      definitions.clear();
    },
  };
}
