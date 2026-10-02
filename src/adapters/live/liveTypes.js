export function createLiveSourceId(sourceId) {
  return String(sourceId || '').trim();
}

export function createSourceChannelId(sourceId, sourceItemId) {
  return `source-channel:${createLiveSourceId(sourceId)}:${String(sourceItemId ?? '').trim()}`;
}

export function createLiveStreamId(sourceId, sourceItemId, index = 0) {
  return `stream:${createLiveSourceId(sourceId)}:${String(sourceItemId ?? '').trim()}:${index + 1}`;
}

export function createEpgProgramId(channelId, startAt, title = '') {
  return `epg:${channelId}:${String(startAt ?? '')}:${String(title).trim()}`;
}

export function createChannelIdentityKey({ channelKey, name }) {
  const explicit = String(channelKey ?? '').trim();
  if (explicit) return `key:${explicit}`;
  return `name:${String(name ?? '').trim().toLocaleLowerCase()}`;
}
