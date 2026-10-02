export const ContentType = Object.freeze({
  MOVIE: 'movie',
  SERIES: 'series',
  ANIME: 'anime',
  VARIETY: 'variety',
  DOCUMENTARY: 'documentary',
  SHORT_DRAMA: 'short-drama',
  OTHER: 'other',
});

function cleanIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createContentIdentity({ canonicalId = '', title = '', year = '', type = '', region = '' } = {}) {
  const canonical = cleanIdentity(canonicalId);
  if (canonical) return `canonical:${canonical}`;
  return '';
}

export function createContentId(sourceId, sourceItemId) {
  return `content:${sourceId}:${sourceItemId}`;
}

export function createEpisodeId(contentId, sourceId, sourceItemId, canonicalEpisodeId = '') {
  const canonical = cleanIdentity(canonicalEpisodeId);
  return canonical ? `episode:${contentId}:canonical:${canonical}` : `episode:${contentId}:${sourceId}:${sourceItemId}`;
}

export function normalizeEpisode({ contentId, sourceId, sourceItemId, canonicalEpisodeId = '', number, title, description = '', playbackCandidates = [] }) {
  const episodeIdentity = cleanIdentity(canonicalEpisodeId) ? `canonical:${cleanIdentity(canonicalEpisodeId)}` : '';
  return {
    episodeId: createEpisodeId(contentId, sourceId, sourceItemId, canonicalEpisodeId),
    episodeIdentity,
    contentId,
    episodeNumber: number,
    title,
    description,
    sourceRefs: [{ sourceId, sourceItemId }],
    playbackCandidates: playbackCandidates.map((candidate) => ({ ...candidate, sourceId: candidate.sourceId ?? sourceId })),
  };
}

export function normalizeContent({
  sourceId,
  sourceItemId,
  canonicalId = '',
  title,
  type,
  poster = '',
  backdrop = '',
  description = '',
  year = '',
  category = '',
  region = '',
  director = '',
  actors = [],
  popularity = 0,
  status = '',
  updateStatus = status,
  totalEpisodes = null,
  currentEpisode = null,
  createdAt = null,
  updatedAt = null,
  episodes = [],
}) {
  const legacyContentId = createContentId(sourceId, sourceItemId);
  const contentIdentity = createContentIdentity({ canonicalId, title, year, type, region });
  // Without a stable external identity, keep the content source-qualified.
  // This prevents display-name collisions while still allowing explicit cross-source aggregation.
  const contentId = `content:${contentIdentity || legacyContentId}`;
  const normalizedEpisodes = episodes.map((episode, index) => normalizeEpisode({
    contentId,
    sourceId,
    sourceItemId: episode.sourceItemId ?? `${sourceItemId}:episode:${index + 1}`,
    number: index + 1,
    title: episode.title ?? episode,
    description: episode.description ?? '',
    playbackCandidates: episode.playbackCandidates ?? [],
  }));
  const episodeCount = totalEpisodes == null ? normalizedEpisodes.length : Math.max(0, Number(totalEpisodes) || 0);
  return {
    contentId,
    legacyContentId,
    contentIdentity,
    contentType: type,
    title,
    subtitle: '',
    poster,
    backdrop,
    description,
    year,
    category,
    region,
    directors: director ? [director] : [],
    director,
    actors: Array.isArray(actors) ? actors : [],
    popularity: Number(popularity) || 0,
    updateStatus: updateStatus || '',
    status: updateStatus || '',
    totalEpisodes: episodeCount,
    currentEpisode: currentEpisode == null ? (normalizedEpisodes.length || null) : Math.max(0, Number(currentEpisode) || 0),
    availableSourceCount: 1,
    createdAt: createdAt == null ? null : createdAt,
    updatedAt: updatedAt == null ? null : updatedAt,
    sourceRefs: [{ sourceId, sourceItemId }],
    episodes: normalizedEpisodes,
    syncAt: Date.now(),
  };
}
