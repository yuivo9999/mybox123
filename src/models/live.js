function cleanIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createChannelIdentity({ canonicalId = '', channelKey = '', name = '', category = '' } = {}) {
  const canonical = cleanIdentity(canonicalId || channelKey);
  if (canonical) return `canonical:${canonical}`;
  // No stable cross-source identity: keep the channel source-qualified.
  return `unresolved:${cleanIdentity(name)}|${cleanIdentity(category)}`;
}

export function createChannelId(sourceId, sourceItemId, identity = '') {
  return `channel:${identity || `${sourceId}:${sourceItemId}`}`;
}

export function createStreamId(sourceId, sourceItemId, index = 0) {
  return `stream:${sourceId}:${sourceItemId}:${index + 1}`;
}

export function createSourceChannelId(sourceId, sourceItemId) {
  return `source-channel:${sourceId}:${sourceItemId}`;
}

export function getEpgProgramStatus(program, now = Date.now()) {
  const start = Date.parse(program?.startAt ?? '');
  const end = Date.parse(program?.endAt ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unknown';
  if (now < start) return 'upcoming';
  if (now >= start && now < end) return 'live';
  return 'ended';
}

export function normalizeChannel({ sourceId, sourceItemId, canonicalId = '', channelKey = '', name, category, logo = '', streams = [], epg = [] }) {
  const sourceChannelId = createSourceChannelId(sourceId, sourceItemId);
  const identity = createChannelIdentity({ canonicalId, channelKey, name, category });
  const channelId = createChannelId(sourceId, sourceItemId, identity);
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
      status: getEpgProgramStatus(program),
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
