export function getLiveStreamCacheKey(channel, sources = []) {
  if (!channel?.channelId) return '';
  const sourceId = channel.sourceRefs?.find(ref =>
    sources.some(source =>
      source.sourceId === ref.sourceId
      && source.sourceType === 'live'
      && source.enabled !== false
    )
  )?.sourceId || channel.sourceRefs?.[0]?.sourceId || 'merged';
  return sourceId + '\u0000' + channel.channelId;
}
