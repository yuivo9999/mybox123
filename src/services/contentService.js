function mergeEpisodes(existing, incoming) {
  const byKey = new Map(existing.map(episode => [`${episode.episodeNumber}|${String(episode.title).trim().toLowerCase()}`, episode]));
  for (const episode of incoming) {
    const key = `${episode.episodeNumber}|${String(episode.title).trim().toLowerCase()}`;
    const current = byKey.get(key);
    if (!current) { byKey.set(key, episode); continue; }
    current.sourceRefs.push(...episode.sourceRefs.filter(ref => !current.sourceRefs.some(item => item.sourceId === ref.sourceId && item.sourceItemId === ref.sourceItemId)));
    current.playbackCandidates.push(...episode.playbackCandidates);
  }
  return [...byKey.values()];
}

export function mergeContents(items = []) {
  const byIdentity = new Map();
  for (const item of items) {
    if (!item?.contentId) continue;
    const key = item.contentIdentity || item.contentId;
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, {
        ...item,
        sourceRefs: [...(item.sourceRefs ?? [])],
        episodes: [...(item.episodes ?? [])],
      });
      continue;
    }
    current.sourceRefs.push(...(item.sourceRefs ?? []).filter(ref => !current.sourceRefs.some(x => x.sourceId === ref.sourceId && x.sourceItemId === ref.sourceItemId)));
    current.episodes = mergeEpisodes(current.episodes, item.episodes ?? []);
    if (!current.poster && item.poster) current.poster = item.poster;
    if (!current.backdrop && item.backdrop) current.backdrop = item.backdrop;
    if (!current.description && item.description) current.description = item.description;
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
