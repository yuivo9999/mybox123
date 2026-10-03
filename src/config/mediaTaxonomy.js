export const MEDIA_TYPE = Object.freeze({
  MOVIE: 'movie',
  TV: 'tv',
  VARIETY: 'variety',
});

export const MEDIA_TAXONOMY = Object.freeze({
  movie: [
    { id: 'drama', label: '剧情片' },
    { id: 'sci-fi', label: '科幻片' },
    { id: 'romance', label: '爱情片' },
    { id: 'action', label: '动作片' },
    { id: 'thriller', label: '惊悚片' },
    { id: 'animation', label: '动画电影片' },
    { id: 'comedy', label: '喜剧片' },
    { id: 'war', label: '战争片' },
  ],
  tv: [
    { id: 'china', label: '国产剧' },
    { id: 'japan', label: '日剧' },
    { id: 'korea', label: '韩剧' },
    { id: 'usa', label: '美剧' },
    { id: 'uk', label: '英剧' },
    { id: 'thailand', label: '泰剧' },
    { id: 'other', label: '其他剧' },
  ],
  variety: [
    { id: 'china', label: '国产综艺' },
    { id: 'japan', label: '日本综艺' },
    { id: 'korea', label: '韩国综艺' },
    { id: 'usa', label: '美国综艺' },
    { id: 'other', label: '其他综艺' },
  ],
});

const labelMap = Object.fromEntries(
  Object.entries(MEDIA_TAXONOMY).flatMap(([type, items]) => items.map(item => [`${type}:${item.id}`, item.label])),
);

function text(...values) {
  return values.filter(value => value != null).map(value => String(value).trim().toLowerCase()).join(' ');
}

function hasAny(value, keywords) {
  return keywords.some(keyword => value.includes(keyword));
}

export function classifyMedia({ type = '', category = '', region = '', title = '', episodes = [] } = {}) {
  const raw = text(type, category, region, title);
  const typeText = text(type);
  let mediaType;

  if (hasAny(typeText, ['variety', '综艺', '真人秀', '脱口秀'])) mediaType = MEDIA_TYPE.VARIETY;
  else if (hasAny(typeText, ['series', 'tv', '电视剧', '连续剧', '剧集', 'drama-series'])) mediaType = MEDIA_TYPE.TV;
  else if (hasAny(typeText, ['movie', '电影', 'film'])) mediaType = MEDIA_TYPE.MOVIE;
  else if (episodes.length > 1) mediaType = MEDIA_TYPE.TV;
  else if (hasAny(raw, ['综艺', '真人秀', '脱口秀', 'variety'])) mediaType = MEDIA_TYPE.VARIETY;
  else if (hasAny(raw, ['电视剧', '连续剧', '剧集', 'tv剧', '日剧', '韩剧', '美剧', '英剧', '泰剧', '国产剧'])) mediaType = MEDIA_TYPE.TV;
  else mediaType = MEDIA_TYPE.MOVIE;

  const ids = [];
  const add = id => { if (!ids.includes(id)) ids.push(id); };

  if (mediaType === MEDIA_TYPE.MOVIE) {
    if (hasAny(raw, ['剧情', 'drama'])) add('drama');
    if (hasAny(raw, ['科幻', 'sci-fi', 'scifi'])) add('sci-fi');
    if (hasAny(raw, ['爱情', 'romance'])) add('romance');
    if (hasAny(raw, ['动作', 'action'])) add('action');
    if (hasAny(raw, ['惊悚', 'thriller', '悬疑惊悚'])) add('thriller');
    if (hasAny(raw, ['动画电影', '动画片', 'animation', '动漫电影'])) add('animation');
    if (hasAny(raw, ['喜剧', 'comedy'])) add('comedy');
    if (hasAny(raw, ['战争', 'war'])) add('war');
    if (!ids.length) add('drama');
  } else if (mediaType === MEDIA_TYPE.TV) {
    if (hasAny(raw, ['国产', '中国大陆', '中国内地', '大陆剧', 'china'])) add('china');
    else if (hasAny(raw, ['日本', '日剧', 'japan'])) add('japan');
    else if (hasAny(raw, ['韩国', '韩剧', 'korea'])) add('korea');
    else if (hasAny(raw, ['美国', '美剧', 'usa', 'us剧'])) add('usa');
    else if (hasAny(raw, ['英国', '英剧', 'uk'])) add('uk');
    else if (hasAny(raw, ['泰国', '泰剧', 'thailand'])) add('thailand');
    else add('other');
  } else {
    if (hasAny(raw, ['国产', '中国大陆', '中国内地', 'china'])) add('china');
    else if (hasAny(raw, ['日本', '日综', '日本综艺', 'japan'])) add('japan');
    else if (hasAny(raw, ['韩国', '韩综', '韩国综艺', 'korea'])) add('korea');
    else if (hasAny(raw, ['美国', '美综', '美国综艺', 'usa'])) add('usa');
    else add('other');
  }

  return {
    mediaType,
    categoryIds: ids,
    categoryLabels: ids.map(id => labelMap[`${mediaType}:${id}`]).filter(Boolean),
  };
}

export function getCategoryLabel(mediaType, categoryId) {
  return labelMap[`${mediaType}:${categoryId}`] ?? categoryId;
}

export function getTaxonomy(mediaType) {
  return MEDIA_TAXONOMY[mediaType] ? [...MEDIA_TAXONOMY[mediaType]] : [];
}

export function getCategoryIdByLabel(mediaType, label) {
  return MEDIA_TAXONOMY[mediaType]?.find(item => item.label === label)?.id ?? '';
}
