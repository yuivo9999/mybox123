function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.movies)) return value.movies;
  if (Array.isArray(value?.vod)) return value.vod;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

function splitRoutes(value) {
  if (Array.isArray(value)) return value.map(item => String(item ?? '').trim()).filter(Boolean);
  return String(value ?? '').split('$$$').map(item => item.trim()).filter(Boolean);
}

function parseRouteEpisodes(route, routeIndex = 0, routeLabel = '') {
  return String(route ?? '')
    .split('#')
    .map((entry, index) => {
      const value = entry.trim();
      if (!value) return null;
      const separator = value.indexOf('$');
      if (separator < 0) return { title: value, episodeNumber: index + 1, playbackCandidates: [] };
      const title = value.slice(0, separator).trim() || `第${index + 1}集`;
      const url = value.slice(separator + 1).trim();
      return {
        title,
        episodeNumber: index + 1,
        playbackCandidates: url ? [{ mediaUrl: url, label: routeLabel || `线路${routeIndex + 1}`, metadata: { tvboxPlayFlag: routeLabel || `线路${routeIndex + 1}`, tvboxRouteIndex: routeIndex } }] : [],
      };
    })
    .filter(Boolean);
}

function asEpisodes(item) {
  const raw = item?.episodes ?? item?.eps ?? item?.playlists;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\s*[|,]\s*/).filter(Boolean).map(title => ({ title }));
  }
  const routes = splitRoutes(item?.vod_play_url);
  if (routes.length) const routeLabels = splitRoutes(item?.vod_play_from);
  return routes.flatMap((route, index) => parseRouteEpisodes(route, index, routeLabels[index] || ''));
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
      type: item.type ?? item.vod_type ?? item.contentType ?? item.mediaType ?? '',
      category: item.category ?? item.type_name ?? item.vod_class ?? item.group ?? item.categoryName ?? '未分类',
      poster: item.poster ?? item.pic ?? item.vod_pic ?? item.image ?? '',
      backdrop: item.backdrop ?? item.pic_slide ?? '',
      description: item.description ?? item.desc ?? item.vod_content ?? '',
      year: String(item.year ?? item.vod_year ?? ''),
      region: item.region ?? item.vod_area ?? '',
      director: item.director ?? item.vod_director ?? '',
      actors: Array.isArray(item.actors) ? item.actors : String(item.vod_actor ?? '').split(/[,，/\\s]+/).filter(Boolean),
      popularity: Number(item.popularity ?? item.vod_hits ?? 0) || 0,
      episodes: episodes.length ? episodes : (urls.length ? urls.map((url, i) => ({ title: `第${i + 1}集`, playbackCandidates: [{ mediaUrl: url }] })) : []),
    }];
  });
}
\n/**\n * Normalize a TVBox/CatVod Spider response into the same raw item shape used by\n * the normal movie pipeline. Accepts common vod_* and playback fields.\n */\nexport function parseTVBoxResult(input) {\n  const value = typeof input === 'string' ? JSON.parse(input) : input;\n  const list = asArray(value);\n  return list.flatMap((item, index) => {\n    if (!item || typeof item !== 'object') return [];\n    return [{\n      sourceItemId: String(item.sourceItemId ?? item.vod_id ?? item.id ?? `item-${index + 1}`),\n      canonicalId: item.canonicalId ?? item.globalId ?? item.vod_id ?? item.id ?? '',\n      title: String(item.title ?? item.name ?? item.vod_name ?? `内容 ${index + 1}`),\n      type: item.type ?? item.contentType ?? item.vod_type ?? '',\n      category: item.category ?? item.type_name ?? item.vod_class ?? item.group ?? item.categoryName ?? '',\n      poster: item.poster ?? item.pic ?? item.vod_pic ?? item.image ?? '',\n      backdrop: item.backdrop ?? item.vod_pic_slide ?? item.pic_slide ?? '',\n      description: item.description ?? item.desc ?? item.vod_content ?? '',\n      year: String(item.year ?? item.vod_year ?? ''),\n      region: item.region ?? item.area ?? item.vod_area ?? '',\n      director: item.director ?? item.vod_director ?? '',\n      actors: Array.isArray(item.actors) ? item.actors : String(item.vod_actor ?? '').split(/[,，/\\s]+/).filter(Boolean),\n      popularity: Number(item.popularity ?? item.vod_hits ?? 0) || 0,\n      updateInfo: item.updateInfo ?? item.vod_remarks ?? item.vod_state ?? '',\n      episodes: asEpisodes(item),\n    }];\n  });\n}\n