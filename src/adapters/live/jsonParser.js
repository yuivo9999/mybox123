function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.channels)) return value.channels;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.list)) return value.list;
  return [];
}

export function parseJSONLive(input) {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  return asArray(value).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const streams = Array.isArray(item.streams) ? item.streams : Array.isArray(item.urls) ? item.urls.map((url) => ({ url })) : item.url ? [{ url: item.url }] : [];
    return [{
      sourceItemId: String(item.sourceItemId ?? item.id ?? item.channelId ?? `item-${index + 1}`),
      channelKey: item.channelKey ?? item.id ?? item.channelId ?? '',
      name: item.name ?? item.title ?? `频道 ${index + 1}`,
      logo: item.logo ?? item.icon ?? '',
      category: item.category ?? item.group ?? item.categoryName ?? '未分类',
      streams: streams.filter((stream) => stream?.url).map((stream) => ({ url: stream.url, label: stream.label ?? stream.name ?? '' })),
      epg: Array.isArray(item.epg) ? item.epg : [],
    }];
  });
}
