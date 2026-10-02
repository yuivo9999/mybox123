function mergeEpisodes(existing, incoming) {
  const byKey = new Map(existing.map(episode => [episode.episodeIdentity || episode.episodeId, episode]));
  for (const episode of incoming) {
    const key = episode.episodeIdentity || episode.episodeId;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...episode, sourceRefs: [...(episode.sourceRefs ?? [])], playbackCandidates: [...(episode.playbackCandidates ?? [])] });
      continue;
    }
    current.sourceRefs.push(...(episode.sourceRefs ?? []).filter(ref => !current.sourceRefs.some(item => item.sourceId === ref.sourceId && item.sourceItemId === ref.sourceItemId)));
    current.playbackCandidates.push(...(episode.playbackCandidates ?? []).filter(candidate => !current.playbackCandidates.some(item => item.candidateId && item.candidateId === candidate.candidateId)));
  }
  return [...byKey.values()];
}

export function mergeContents(items = []) {
  const byIdentity = new Map();
  for (const item of items) {
    if (!item?.contentId) continue;
    // contentIdentity is only populated for an explicit stable external identity.
    // Otherwise contentId remains source-qualified and must not be merged by display metadata.
    const key = item.contentIdentity || item.contentId;
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, {
        ...item,
        sourceRefs: [...(item.sourceRefs ?? [])],
        episodes: [...(item.episodes ?? [])],
        availableSourceCount: Math.max(1, new Set((item.sourceRefs ?? []).map(ref => ref.sourceId).filter(Boolean)).size),
      });
      continue;
    }
    current.sourceRefs.push(...(item.sourceRefs ?? []).filter(ref => !current.sourceRefs.some(x => x.sourceId === ref.sourceId && x.sourceItemId === ref.sourceItemId)));
    current.episodes = mergeEpisodes(current.episodes, item.episodes ?? []);
    if (!current.poster && item.poster) current.poster = item.poster;
    if (!current.backdrop && item.backdrop) current.backdrop = item.backdrop;
    if (!current.description && item.description) current.description = item.description;
    if (!current.updateStatus && item.updateStatus) current.updateStatus = item.updateStatus;
    if (!current.status && item.status) current.status = item.status;
    current.totalEpisodes = Math.max(current.totalEpisodes ?? 0, item.totalEpisodes ?? 0, current.episodes.length);
    current.currentEpisode = Math.max(current.currentEpisode ?? 0, item.currentEpisode ?? 0);
    current.availableSourceCount = new Set(current.sourceRefs.map(ref => ref.sourceId).filter(Boolean)).size;
    current.createdAt = current.createdAt ?? item.createdAt ?? null;
    current.updatedAt = Math.max(current.updatedAt ?? 0, item.updatedAt ?? 0) || null;
    current.popularity = Math.max(current.popularity ?? 0, item.popularity ?? 0);
    current.syncAt = Math.max(current.syncAt ?? 0, item.syncAt ?? 0);
  }
  return [...byIdentity.values()];
}

export const contentService = {
  getMovies: (items = []) => mergeContents(items),
  getById: (items, contentId) => items.find((item) => item.contentId === contentId || item.legacyContentId === contentId) ?? null,
  mergeContents,
};
