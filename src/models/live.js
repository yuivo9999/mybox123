export function createChannelId(sourceId, sourceItemId) {
  return `channel:${sourceId}:${sourceItemId}`;
}

export function createStreamId(sourceId, sourceItemId, index = 0) {
  return `stream:${sourceId}:${sourceItemId}:${index + 1}`;
}

export function createSourceChannelId(sourceId, sourceItemId) {
  return `source-channel:${sourceId}:${sourceItemId}`;
}

export function normalizeChannel({ sourceId, sourceItemId, name, category, logo = '', streams = [], epg = [] }) {
  const channelId = createChannelId(sourceId, sourceItemId);
  const sourceChannelId = createSourceChannelId(sourceId, sourceItemId);
  return {
    channelId,
    name,
    logo,
    category,
    sourceRefs: [{ sourceId, sourceChannelId, sourceItemId }],
    streams: streams.filter((stream) => stream?.url).map((stream, index) => ({
      streamId: stream.streamId ?? createStreamId(sourceId, sourceItemId, index),
      sourceId,
      sourceChannelId,
      sourceItemId: stream.sourceItemId ?? sourceItemId,
      url: stream.url,
      protocol: stream.protocol ?? inferProtocol(stream.url),
      label: stream.label ?? `线路 ${index + 1}`,
      headers: stream.headers ?? {},
      cookies: stream.cookies ?? '',
      referer: stream.referer ?? '',
      userAgent: stream.userAgent ?? '',
    })),
    epg: epg.map((program, index) => ({
      programId: program.programId ?? `epg:${channelId}:${program.startAt ?? index}`,
      channelId,
      startAt: program.startAt ?? '',
      endAt: program.endAt ?? '',
      title: program.title ?? '',
      description: program.description ?? '',
    })),
    status: 'available',
    syncAt: Date.now(),
  };
}

function inferProtocol(url) {
  const value = String(url ?? '').toLowerCase();
  if (value.includes('.m3u8')) return 'hls';
  if (value.includes('.mpd')) return 'dash';
  if (value.startsWith('rtmp://')) return 'rtmp';
  if (value.startsWith('rtsp://')) return 'rtsp';
  return 'http';
}
