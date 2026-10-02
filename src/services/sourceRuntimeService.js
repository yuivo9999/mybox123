import { sourceRepository } from '../repositories/sourceRepository.js';
import { syncMovieSources } from './movieSourceService.js';
import { liveRegistry } from './liveService.js';
import { createLiveAdapter } from '../adapters/live/liveAdapter.js';

export async function syncAllSources() {
  const sources = sourceRepository.getAll().filter(source => source.enabled !== false);
  const movieResult = await syncMovieSources(sources);

  liveRegistry.clear();
  sources.filter(source => source.sourceType === 'live' && (source.sourceRef || source.url)).forEach(source => {
    liveRegistry.register(createLiveAdapter({ ...source, sourceRef: source.sourceRef || source.url }));
  });
  const liveResult = await (async () => {
    try { return await (await import('./liveService.js')).liveService.sync(); }
    catch (error) { return { channels: [], results: [{ status: 'rejected', reason: error }] }; }
  })();

  return {
    sources,
    movies: movieResult.movies,
    channels: liveResult.channels,
    results: [...movieResult.results, ...liveResult.results],
  };
}
