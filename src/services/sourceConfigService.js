import { sourceRepository } from '../repositories/sourceRepository.js';

function validateImportedSources(value) {
  if (!Array.isArray(value)) throw new Error('SOURCE_IMPORT_ARRAY_REQUIRED');
  return value.map((source, index) => {
    if (!source || typeof source !== 'object') throw new Error(`SOURCE_IMPORT_ITEM_INVALID:${index}`);
    const sourceRef = String(source.sourceRef || source.url || '').trim();
    if (!sourceRef) throw new Error(`SOURCE_IMPORT_URL_REQUIRED:${index}`);
    return source;
  });
}

export const sourceConfigService = {
  read() {
    return sourceRepository.getAll();
  },
  normalize(sources) {
    return sourceRepository.saveAll(validateImportedSources(sources)) || sourceRepository.getAll();
  },
  async importFile(file) {
    if (!file || typeof file.text !== 'function') throw new Error('SOURCE_IMPORT_FILE_REQUIRED');
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
      return this.normalize(parsed);
    } catch {
      const trimmed = text.trim();
      const fileName = file.name || 'live.txt';
      if (/#genre#/i.test(trimmed) || /^#EXTM3U/i.test(trimmed) || fileName.endsWith('.txt') || fileName.endsWith('.m3u')) {
        const dataUrl = await this.readFileAsDataURL(file);
        const sourceName = fileName.replace(/\.[^.]+$/, '') || '本地直播源 (TXT)';
        const currentSources = this.read();
        const newSource = {
          sourceId: `source_live_${Date.now()}`,
          name: sourceName,
          sourceType: 'live',
          url: dataUrl,
          enabled: true,
          status: '未测试',
          createdAt: Date.now(),
        };
        const nextSources = [...currentSources, newSource];
        sourceRepository.saveAll(nextSources);
        return nextSources;
      }
      throw new Error('SOURCE_IMPORT_JSON_INVALID');
    }
  },
  async readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  },
  exportText(sources) {
    return JSON.stringify(Array.isArray(sources) ? sources : sourceRepository.getAll(), null, 2);
  },
  download(sources, filename = 'tvbox-sources.json') {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') throw new Error('SOURCE_EXPORT_BROWSER_REQUIRED');
    const blob = new Blob([this.exportText(sources)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};