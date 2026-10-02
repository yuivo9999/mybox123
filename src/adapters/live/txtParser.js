/**
 * Parser for TVBox / DIYP / IPTV `#genre#` TXT live channel format.
 * Format sample:
 * 
 * 📺央视频道,#genre#
 * CCTV-1,http://example.com/cctv1_1.m3u8
 * CCTV-1,http://example.com/cctv1_2.m3u8
 * CCTV-2,http://example.com/cctv2.m3u8#http://example.com/cctv2_backup.m3u8
 * 
 * 📡卫视频道,#genre#
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
    if (line.includes('#genre#') || /\[.+\]/.test(line)) {
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

    // 3. Find separator between channel name and stream URL (support English ',' and Chinese '，')
    const commaIndex = line.search(/[,，]/);
    if (commaIndex === -1) continue;

    const name = line.slice(0, commaIndex).trim();
    const rawUrls = line.slice(commaIndex + 1).trim();

    if (!name || !rawUrls) continue;

    // Check if URL has valid protocol or structure
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

    for (const url of urlCandidates) {
      // Filter valid video streaming links
      if (/^(?:https?|rtmp|rtsp|p2p|mitv|mms):\/\//i.test(url) || url.includes('.m3u8') || url.includes('.flv') || url.includes('.mp4')) {
        const streamIndex = channel.streams.length + 1;
        channel.streams.push({
          url: url,
          label: `线路 ${streamIndex}`,
          quality: '',
          resolution: '',
        });
      }
    }
  }

  return channelsList;
}

export function isTXTGenreFormat(text) {
  if (!text || typeof text !== 'string') return false;
  if (/#genre#/i.test(text)) return true;
  
  const sampleLines = text.split(/\r?\n/).slice(0, 20).filter(Boolean);
  let matchCount = 0;
  for (const line of sampleLines) {
    if (/[^,，\r\n]+[,，]\s*(?:https?|rtmp|rtsp):\/\//i.test(line)) {
      matchCount++;
    }
  }
  return matchCount >= 2;
}
