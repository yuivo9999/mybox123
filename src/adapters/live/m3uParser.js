function parseAttributes(line) {
  const attrs = {};
  const attrPart = line.replace(/^#EXTINF:[^ ]*\s*-?[^,]*,?/i, '').trim();
  const source = line.includes(' ') ? line.slice(line.indexOf(' ') + 1) : '';
  const regex = /([\w-]+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(source))) attrs[match[1]] = match[2];
  return { attrs, title: attrPart || attrs['tvg-name'] || '' };
}

export function parseM3U(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim());
  const channels = [];
  let pending = null;
  for (const line of lines) {
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      const { attrs, title } = parseAttributes(line);
      pending = { ...attrs, title };
      continue;
    }
    if (line.startsWith('#')) continue;
    if (pending) {
      channels.push({
        sourceItemId: pending['tvg-id'] || pending.title || `item-${channels.length + 1}`,
        channelKey: pending['tvg-id'] || pending.title || '',
        name: pending.title || pending['tvg-name'] || `频道 ${channels.length + 1}`,
        logo: pending['tvg-logo'] || '',
        category: pending['group-title'] || '未分类',
        stream: { url: line, label: pending['tvg-name'] || '主线路' },
      });
      pending = null;
    }
  }
  return channels;
}
