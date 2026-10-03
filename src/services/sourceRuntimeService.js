import { sourceRepository } from '../repositories/sourceRepository.js';
import { testMovieSource } from './movieSourceService.js';
import { liveService } from './liveService.js';
import { sourceRegistryService } from './sourceRegistryService.js';
import { userDataService } from './userDataService.js';

export async function testSource(source, options = {}) {
  if (!source?.sourceId) throw new Error('SOURCE_ID_REQUIRED');

  if (source.sourceType === 'movie') {
    return testMovieSource(source, options);
  }

  if (source.sourceType === 'live') {
    return sourceRegistryService.testLiveSource(source, options);
  }

  return { ok: false, sourceId: source.sourceId, status: 'unsupported', checkedAt: Date.now() };
}

export async function syncAllSources({ movieSourceId = null } = {}) {
  const sources = sourceRepository.getAll().filter(source => source.enabled !== false);
  const movieResult = await sourceRegistryService.syncMovieSources(sources, movieSourceId);

  sourceRegistryService.clear();
  sources
    .filter(source => source.sourceType === 'live' && (source.sourceRef || source.url))
    .forEach(source => sourceRegistryService.registerLiveSource(source));

  const liveResult = await liveService.sync();
  userDataService.migrateContentIdentities(movieResult.movies);

  const resultBySource = new Map(
    [...movieResult.results, ...liveResult.results].map(result => [result.sourceId, result]),
  );

  const updatedSources = sources.map(source => {
    const result = resultBySource.get(source.sourceId);
    if (!result) return source;

    const capabilities = result.capabilities
      ?? movieResult.results.find(item => item.sourceId === source.sourceId)?.capabilities
      ?? source.capabilities
      ?? [];

    const failed = result.status === 'rejected';
    return {
      ...source,
      capabilities,
      status: failed
        ? (result.reason?.code === 'SourceEmptyError' ? '空结果' : '异常')
        : (result.stale ? '使用缓存' : '正常'),
      lastCheckedAt: result.adapterStatus?.lastCheckedAt ?? Date.now(),
    };
  });

  sourceRepository.saveAll(updatedSources);

  return {
    sources: updatedSources,
    movies: movieResult.movies,
    channels: liveResult.channels,
    results: [...movieResult.results, ...liveResult.results],
  };
}
