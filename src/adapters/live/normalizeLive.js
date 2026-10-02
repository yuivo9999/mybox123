import { createChannelIdentity, createChannelId, createEpgProgramId, createSourceChannelId, createStreamId, getEpgProgramStatus } from '../../models/live.js';

export function normalizeLiveChannel({ sourceId, item, index = 0 }) {
  const sourceItemId = String(item.sourceItemId ?? item.id ?? `item-${index + 1}`);
  const canonicalId = item.canonicalId ?? item.globalId ?? item.externalId ?? '';
  const channelKey = item.channelKey || '';
  const identity = createChannelIdentity({ canonicalId, channelKey, name: item.name, category: item.category });
  const sourceChannelId = createSourceChannelId(sourceId, sourceItemId);
  const channelId = createChannelId(sourceId, sourceItemId, identity);
  const streams = (item.streams ?? (item.stream ? [item.stream] : [])).filter((stream) => stream?.url).map((stream, streamIndex) => ({
    streamId: stream.streamId ?? createStreamId(sourceId, sourceItemId, streamIndex),
    sourceId,
    sourceChannelId,
    sourceItemId: stream.sourceItemId ?? sourceItemId,
    url: stream.url,
    protocol: stream.protocol ?? inferProtocol(stream.url),
    label: stream.label || `线路 ${streamIndex + 1}`,
    headers: stream.headers ?? {},
    cookies: stream.cookies ?? '',
    referer: stream.referer ?? '',
    userAgent: stream.userAgent ?? '',
  }));
  return {
    channelId,
    name: item.name || sourceItemId,
    logo: item.logo || '',
    category: item.category || '未分类',
    sourceRefs: [{ sourceId, sourceChannelId, sourceItemId }],
    streams,
    epg: normalizeEPG(channelId, item.epg ?? []),
    status: 'available',
    syncAt: Date.now(),
  };
}

export function mergeLiveChannels(channels) {
  const byId = new Map();
  for (const channel of channels) {
    if (!channel?.channelId) continue;
    const existing = byId.get(channel.channelId);
    if (!existing) {
      byId.set(channel.channelId, { ...channel, sourceRefs: [...(channel.sourceRefs ?? [])], streams: [...(channel.streams ?? [])], epg: [...(channel.epg ?? [])], availableSourceCount: channel.sourceRefs?.length ?? 0 });
      continue;
    }
    existing.sourceRefs.push(...(channel.sourceRefs ?? []).filter((ref) => !existing.sourceRefs.some((x) => x.sourceChannelId === ref.sourceChannelId)));
    const knownStreams = new Set(existing.streams.map((stream) => stream.streamId));
    existing.streams.push(...(channel.streams ?? []).filter((stream) => !knownStreams.has(stream.streamId)));
    const knownPrograms = new Set(existing.epg.map((program) => program.programId));
    existing.epg.push(...(channel.epg ?? []).filter((program) => !knownPrograms.has(program.programId)));
    existing.availableSourceCount = existing.sourceRefs.length;
    existing.status = existing.status === 'available' || channel.status === 'available' ? 'available' : channel.status;
    existing.syncAt = Math.max(existing.syncAt ?? 0, channel.syncAt ?? 0);
  }
  return [...byId.values()];
}

function normalizeEPG(channelId, programs) {
  return programs.map((program, index) => ({
    programId: program.programId || createEpgProgramId(channelId, program.startAt || index, program.title),
    channelId,
    startAt: program.startAt ?? '',
    endAt: program.endAt ?? '',
    title: program.title ?? '',
    description: program.description ?? '',
    status: getEpgProgramStatus(program),
  }));
}

function inferProtocol(url) {
  const value = String(url).toLowerCase();
  if (value.includes('.m3u8')) return 'hls';
  if (value.includes('.mpd')) return 'dash';
  if (value.startsWith('rtmp://')) return 'rtmp';
  if (value.startsWith('rtsp://')) return 'rtsp';
  return 'http';
}
