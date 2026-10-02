function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.movies)) return value.movies;
  if (Array.isArray(value?.vod)) return value.vod;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

function asEpisodes(item) {
  const raw = item?.episodes ?? item?.eps ?? item?.playlists ?? item?.vod_play_from ?? [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(/\s*[|,]\s*/).filter(Boolean).map(title => ({ title }));
  return [];
}

export function parseJSONMovies(input) {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  return asArray(value).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const episodes = asEpisodes(item);
    const urls = Array.isArray(item.urls) ? item.urls : [];
    return [{
      sourceItemId: String(item.sourceItemId ?? item.vod_id ?? item.id ?? `item-${index + 1}`),
      title: String(item.title ?? item.name ?? item.vod_name ?? `内容 ${index + 1}`),
      type: item.type ?? item.vod_type ?? item.contentType ?? 'movie',
      category: item.category ?? item.type_name ?? item.group ?? item.categoryName ?? '未分类',
      poster: item.poster ?? item.pic ?? item.vod_pic ?? item.image ?? '',
      backdrop: item.backdrop ?? item.pic_slide ?? '',
      description: item.description ?? item.desc ?? item.vod_content ?? '',
      year: String(item.year ?? item.vod_year ?? ''),
      region: item.region ?? item.vod_area ?? '',
      director: item.director ?? item.vod_director ?? '',
      actors: Array.isArray(item.actors) ? item.actors : String(item.vod_actor ?? '').split(/[,，/\\s]+/).filter(Boolean),
      popularity: Number(item.popularity ?? item.vod_hits ?? 0) || 0,
      episodes: episodes.length ? episodes : (urls.length ? urls.map((url, i) => ({ title: `第${i + 1}集`, url })) : []),
    }];
  });
}
