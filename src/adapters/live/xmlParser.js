export function parseXMLLive(text) {
  if (typeof DOMParser === 'undefined') throw new Error('XMLParserUnavailable');
  const doc = new DOMParser().parseFromString(String(text ?? ''), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('InvalidXML');
  return Array.from(doc.querySelectorAll('channel')).map((node, index) => ({
    sourceItemId: node.getAttribute('id') || `item-${index + 1}`,
    channelKey: node.getAttribute('id') || '',
    name: node.getAttribute('display-name') || node.querySelector('display-name')?.textContent?.trim() || `频道 ${index + 1}`,
    logo: node.querySelector('icon')?.getAttribute('src') || '',
    category: node.getAttribute('group') || '未分类',
    streams: [],
  }));
}

export function parseXMLEPG(text) {
  if (typeof DOMParser === 'undefined') throw new Error('XMLParserUnavailable');
  const doc = new DOMParser().parseFromString(String(text ?? ''), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('InvalidXML');
  return Array.from(doc.querySelectorAll('programme')).map((node, index) => ({
    programId: node.getAttribute('id') || `program-${index + 1}`,
    channelRef: node.getAttribute('channel') || '',
    startAt: node.getAttribute('start') || '',
    endAt: node.getAttribute('stop') || '',
    title: node.querySelector('title')?.textContent?.trim() || '',
    description: node.querySelector('desc')?.textContent?.trim() || '',
  }));
}
