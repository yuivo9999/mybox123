import { sourceRepository } from '../repositories/sourceRepository.js';
import { testMovieSource } from './movieSourceService.js';
import { liveService } from './liveService.js';
import { sourceRegistryService } from './sourceRegistryService.js';
import { userDataService } from './userDataService.js';
import { tv1LiveService } from './tv1LiveService.js';

export async function testSource(source, options = {}) {
  if (!source?.sourceId) throw new Error('SOURCE_ID_REQUIRED');

  if (source.sourceCapability === 'tvbox-extension' || source.adapterType === 'tvbox-extension') {
    return {
      ok: false,
      sourceId: source.sourceId,
      status: 'unsupported',
      reason: source.tvboxUnsupportedReason || 'TVBox 扩展源当前未适配',
      checkedAt: Date.now(),
    };
  }

  if (source.sourceType === 'movie') {
    return testMovieSource(source, options);
  }

  if (source.sourceType === 'live') {
    if (source.liveMode === 'tv1') return tv1LiveService.healthCheck(source, options);
    const result = await sourceRegistryService.testLiveSource(source, options);
    if (result.ok && result.detectedFormat === 'txt') {
      const currentSources = sourceRepository.getAll();
      sourceRepository.saveAll(currentSources.map(item => (
        item.sourceId === source.sourceId
          ? { ...item, liveMode: 'tv1' }
          : item
      )));
      return { ...result, promotedTo: 'tv1' };
    }
    return result;
  }

  return { ok: false, sourceId: source.sourceId, status: 'unsupported', checkedAt: Date.now() };
}

export async function syncAllSources({ movieSourceId = null } = {}) {
  let sources = sourceRepository.getAll().filter(source => source.enabled !== false);
  const movieResult = await sourceRegistryService.syncMovieSources(sources, movieSourceId);

  sourceRegistryService.clear();
  sources
     .filter(source => source.sourceType === 'live' && source.liveMode !== 'tv1' && (source.sourceRef || source.url))
    .forEach(source => sourceRegistryService.registerLiveSource(source));

  const liveResult = await liveService.sync();
  userDataService.migrateContentIdentities(movieResult.movies);

  const detectedTv1SourceIds = new Set(
    liveResult.results
      .filter(result => result.status === 'fulfilled' && result.adapterStatus?.detectedFormat === 'txt')
      .map(result => result.sourceId),
  );

  if (detectedTv1SourceIds.size) {
    const promotedSources = sourceRepository.getAll().map(source => (
      detectedTv1SourceIds.has(source.sourceId) && source.sourceType === 'live' && source.liveMode !== 'tv1'
        ? { ...source, liveMode: 'tv1' }
        : source
    ));
    sourceRepository.saveAll(promotedSources);
    sources = promotedSources.filter(source => source.enabled !== false);
  }

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
