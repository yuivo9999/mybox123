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
    try { parsed = JSON.parse(text); } catch { throw new Error('SOURCE_IMPORT_JSON_INVALID'); }
    return this.normalize(parsed);
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