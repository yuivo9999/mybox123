import { normalizeContent } from '../../models/content.js';

export function normalizeMovie({ sourceId, item, index = 0 }) {
  const episodes = (item.episodes ?? []).map((episode, episodeIndex) => {
    if (typeof episode === 'string') return { title: episode };
    return {
      sourceItemId: episode.sourceItemId ?? episode.id ?? `${item.sourceItemId}:episode:${episodeIndex + 1}`,
      canonicalEpisodeId: episode.canonicalEpisodeId ?? episode.episodeId ?? episode.globalId ?? '',
      title: episode.title ?? episode.name ?? `第${episodeIndex + 1}集`,
      description: episode.description ?? episode.desc ?? '',
      playbackCandidates: [
        ...(Array.isArray(episode.playbackCandidates) ? episode.playbackCandidates : []),
        ...(episode.url ? [{ mediaUrl: episode.url, protocol: episode.protocol, label: episode.label }] : []),
      ].filter(candidate => candidate.mediaUrl || candidate.url),
    };
  });
  return normalizeContent({
    sourceId,
    sourceItemId: item.sourceItemId ?? item.id ?? `item-${index + 1}`,
    canonicalId: item.canonicalId ?? item.contentId ?? item.externalId ?? item.tmdbId ?? item.imdbId ?? '',
    title: item.title,
    type: item.type,
    poster: item.poster,
    backdrop: item.backdrop,
    description: item.description,
    year: item.year,
    category: item.category,
    region: item.region,
    director: item.director,
    actors: item.actors,
    popularity: item.popularity,
    updateStatus: item.updateStatus ?? item.status ?? '',
    totalEpisodes: item.totalEpisodes,
    currentEpisode: item.currentEpisode,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    episodes,
  });
}
