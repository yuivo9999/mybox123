import { normalizeContent } from '../../models/content.js';

export function normalizeMovie({ sourceId, item, index = 0 }) {
  const episodes = (item.episodes ?? []).map((episode, episodeIndex) => {
    if (typeof episode === 'string') return { title: episode };
    return {
      sourceItemId: episode.sourceItemId ?? episode.id ?? `${item.sourceItemId}:episode:${episodeIndex + 1}`,
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
    sourceItemId: item.sourceItemId ?? `item-${index + 1}`,
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
    episodes,
  });
}
