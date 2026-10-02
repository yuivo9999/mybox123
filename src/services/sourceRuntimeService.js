import { sourceRepository } from '../repositories/sourceRepository.js';
import { syncMovieSources } from './movieSourceService.js';
import { liveRegistry, liveService } from './liveService.js';
import { createLiveAdapter } from '../adapters/live/liveAdapter.js';
import { userDataService } from './userDataService.js';

export async function syncAllSources() {
  const sources = sourceRepository.getAll().filter(source => source.enabled !== false);
  const movieResult = await syncMovieSources(sources);

  liveRegistry.clear();
  sources.filter(source => source.sourceType === 'live' && (source.sourceRef || source.url)).forEach(source => {
    liveRegistry.register(createLiveAdapter({ ...source, sourceRef: source.sourceRef || source.url }));
  });

  const liveResult = await liveService.sync();
  userDataService.migrateContentIdentities(movieResult.movies);

  return {
    sources,
    movies: movieResult.movies,
    channels: liveResult.channels,
    results: [...movieResult.results, ...liveResult.results],
  };
}
