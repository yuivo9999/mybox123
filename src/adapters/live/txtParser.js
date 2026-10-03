/**
 * Parser for TVBox / DIYP / IPTV `#genre#` TXT live channel format.
 * Format samples supported:
 * 
 * 📺央视频道,#genre#
 * CCTV-1,http://example.com/cctv1_1.m3u8$超清#http://example.com/cctv1_2.m3u8$高清
 * CCTV-2 http://example.com/cctv2.m3u8
 * CCTV-3，http://example.com/cctv3.m3u8
 * 
 * [📡卫视频道]
 * 广东卫视,http://example.com/gdws.m3u8
 */

export function parseTXTLive(text) {
  if (!text) return [];
  const cleanText = String(text).replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let currentCategory = '默认频道';
  const channelsMap = new Map(); // key: `${currentCategory}:::${name}`
  const channelsList = [];

  for (const line of lines) {
    if (!line) continue;

    // 1. Detect Category line (e.g. "📺央视频道,#genre#" or "卫视频道, #genre#" or "[央视频道]")
    if (line.includes('#genre#') || /^\[.*\]$/.test(line)) {
      let cat = line.replace(/[,，]?\s*#genre#.*$/i, '').trim();
      if (/^\[(.*)\]$/.test(cat)) {
        cat = cat.slice(1, -1).trim();
      }
      if (cat) {
        currentCategory = cat;
      }
      continue;
    }

    // 2. Skip pure comments
    if (line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // 3. Extract channel name and stream URL(s)
    let name = '';
    let rawUrls = '';

    const commaIndex = line.search(/[,，]/);
    if (commaIndex !== -1) {
      name = line.slice(0, commaIndex).trim();
      rawUrls = line.slice(commaIndex + 1).trim();
    } else {
      // Support space or tab separation between name and URL
      const match = line.match(/^([^\s]+)\s+((?:https?|rtmp|rtsp|p2p|mitv|mms):\/\/.+)$/i);
      if (match) {
        name = match[1].trim();
        rawUrls = match[2].trim();
      } else {
        continue;
      }
    }

    if (!name || !rawUrls) continue;

    // A single line may have multiple URLs separated by '#' (e.g., url1#url2)
    const urlCandidates = rawUrls.split('#').map(u => u.trim()).filter(Boolean);

    const mapKey = `${currentCategory}:::${name}`;
    let channel = channelsMap.get(mapKey);

    if (!channel) {
      const channelIndex = channelsList.length + 1;
      channel = {
        sourceItemId: `txt-${channelIndex}-${name}`,
        canonicalId: name,
        channelKey: name,
        name: name,
        logo: '',
        categoryId: currentCategory,
        category: currentCategory,
        sourceOrder: channelsList.length,
        streams: [],
        epg: [],
        currentProgram: null,
        upcomingProgram: null,
      };
      channelsMap.set(mapKey, channel);
      channelsList.push(channel);
    }

    for (const cand of urlCandidates) {
      let streamUrl = cand;
      const streamIndex = channel.streams.length + 1;
      let streamLabel = `线路 ${streamIndex}`;

      // Handle stream label after '$' (e.g. http://live.com/1.m3u8$超清)
      if (streamUrl.includes('$')) {
        const parts = streamUrl.split('$');
        streamUrl = parts[0].trim();
        if (parts[1]?.trim()) {
          streamLabel = parts[1].trim();
        }
      }

      // Filter valid video streaming links
      if (/^(?:https?|rtmp|rtsp|p2p|mitv|mms):\/\//i.test(streamUrl) || streamUrl.includes('.m3u8') || streamUrl.includes('.flv') || streamUrl.includes('.mp4')) {
        channel.streams.push({
          url: streamUrl,
          label: streamLabel,
          quality: '',
          resolution: '',
        });
      }
    }
  }

  return channelsList;
}


export function parseTXTLiveMetadata(text) {
  if (!text) return [];
  const cleanText = String(text).replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/);
  let currentCategory = '默认频道';
  const seen = new Set();
  const channels = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    if (line.includes('#genre#') || /^\[.*\]$/.test(line)) {
      let cat = line.replace(/[,，]?\s*#genre#.*$/i, '').trim();
      const bracket = cat.match(/^\[(.*)\]$/);
      if (bracket) cat = bracket[1].trim();
      if (cat) currentCategory = cat;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const commaIndex = line.search(/[,，]/);
    let name = '';
    if (commaIndex !== -1) name = line.slice(0, commaIndex).trim();
    else name = line.match(/^([^\s]+)\s+/)?.[1]?.trim() || '';
    if (!name) continue;

    const key = currentCategory + ':::' + name;
    if (seen.has(key)) continue;
    seen.add(key);

    channels.push({
      sourceItemId: 'txt-' + (channels.length + 1) + '-' + name,
      canonicalId: name,
      channelKey: name,
      name,
      logo: '',
      categoryId: currentCategory,
      category: currentCategory,
      sourceOrder: channels.length,
      streams: [],
      epg: [],
      currentProgram: null,
      upcomingProgram: null,
      deferredRef: { lineIndex },
    });
  }
  return channels;
}

export function parseTXTLiveLineStreams(line) {
  const value = String(line || '').trim();
  if (!value) return [];
  const commaIndex = value.search(/[,，]/);
  let rawUrls = '';
  if (commaIndex !== -1) rawUrls = value.slice(commaIndex + 1).trim();
  else rawUrls = value.match(/^[^\s]+\s+(.+)$/)?.[1]?.trim() || '';
  if (!rawUrls) return [];

  const separator = String.fromCharCode(36);
  return rawUrls.split('#').map((candidate, index) => {
    let streamUrl = candidate.trim();
    if (!streamUrl) return null;
    let label = '线路 ' + (index + 1);
    if (streamUrl.includes(separator)) {
      const parts = streamUrl.split(separator);
      streamUrl = parts.shift()?.trim() || '';
      if (parts.join(separator).trim()) label = parts.join(separator).trim();
    }
    return streamUrl ? { url: streamUrl, label, quality: '', resolution: '' } : null;
  }).filter(Boolean);
}

export function isTXTGenreFormat(text) {
  if (!text || typeof text !== 'string') return false;
  if (/#genre#/i.test(text)) return true;
  
  const sampleLines = text.split(/\r?\n/).slice(0, 30).filter(Boolean);
  let matchCount = 0;
  for (const line of sampleLines) {
    if (/[^,，\r\n]+[,，]\s*(?:https?|rtmp|rtsp):\/\//i.test(line)) {
      matchCount++;
    } else if (/^[^\s]+\s+(?:https?|rtmp|rtsp):\/\//i.test(line)) {
      matchCount++;
    }
  }
  return matchCount >= 2;
}
