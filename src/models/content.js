export const ContentType = Object.freeze({
  MOVIE: 'movie',
  SERIES: 'series',
  ANIME: 'anime',
  VARIETY: 'variety',
  DOCUMENTARY: 'documentary',
  SHORT_DRAMA: 'short-drama',
  OTHER: 'other',
});

export function createContentId(sourceId, sourceItemId) {
  return `content:${sourceId}:${sourceItemId}`;
}

export function createEpisodeId(contentId, sourceId, sourceItemId) {
  return `episode:${contentId}:${sourceId}:${sourceItemId}`;
}

export function normalizeEpisode({ contentId, sourceId, sourceItemId, number, title, description = '', playbackCandidates = [] }) {
  return {
    episodeId: createEpisodeId(contentId, sourceId, sourceItemId),
    contentId,
    episodeNumber: number,
    title,
    description,
    sourceRefs: [{ sourceId, sourceItemId }],
    playbackCandidates: playbackCandidates.map((candidate) => ({ ...candidate, sourceId: candidate.sourceId ?? sourceId })),
  };
}

export function normalizeContent({ sourceId, sourceItemId, title, type, poster = '', backdrop = '', description = '', year = '', category = '', episodes = [] }) {
  const contentId = createContentId(sourceId, sourceItemId);
  return {
    contentId,
    contentType: type,
    title,
    subtitle: '',
    poster,
    backdrop,
    description,
    year,
    category,
    directors: [],
    actors: [],
    sourceRefs: [{ sourceId, sourceItemId }],
    episodes: episodes.map((episode, index) => normalizeEpisode({
      contentId,
      sourceId,
      sourceItemId: episode.sourceItemId ?? `${sourceItemId}:episode:${index + 1}`,
      number: index + 1,
      title: episode.title ?? episode,
      description: episode.description ?? '',
      playbackCandidates: episode.playbackCandidates ?? [],
    })),
    syncAt: Date.now(),
  };
}
