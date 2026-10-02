export function createMovieRegistry() {
  const adapters = new Map();
  return {
    register(adapter) { if (!adapter?.sourceId) throw new Error('MOVIE_ADAPTER_SOURCE_ID_REQUIRED'); adapters.set(adapter.sourceId, adapter); return adapter; },
    unregister(sourceId) { adapters.delete(sourceId); },
    get(sourceId) { return adapters.get(sourceId) ?? null; },
    list() { return [...adapters.values()]; },
    clear() { adapters.clear(); },
  };
}
