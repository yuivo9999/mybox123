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

function stripJSONComments(str) {
  let out = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  const len = str.length;

  while (i < len) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      out += char;
      i++;
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        out += char;
        i++;
      } else if (char === '/' && nextChar === '/') {
        i += 2;
        while (i < len && str[i] !== '\n' && str[i] !== '\r') {
          i++;
        }
      } else if (char === '/' && nextChar === '*') {
        i += 2;
        while (i < len && !(str[i] === '*' && str[i + 1] === '/')) {
          i++;
        }
        i += 2;
      } else {
        out += char;
        i++;
      }
    }
  }
  return out;
}

function cleanMismatchedBraces(str) {
  let balance = 0;
  let inString = false;
  let stringChar = '';
  let i = 0;
  const len = str.length;

  while (i < len) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (inString) {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      i++;
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        i++;
      } else if (char === '{' || char === '[') {
        balance++;
        i++;
      } else if (char === '}' || char === ']') {
        balance--;
        if (balance === 0) {
          return str.slice(0, i + 1);
        }
        i++;
      } else {
        i++;
      }
    }
  }
  return str;
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
    
    // Attempt parsing standard or relaxed TVBox JSON first
    try {
      const cleanedText = cleanMismatchedBraces(stripJSONComments(text).trim());
      parsed = JSON.parse(cleanedText);
      
      // If it is a TVBox format configuration object
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const imported = [];
        
        // 1. Convert "sites" to Movie Sources
        if (Array.isArray(parsed.sites)) {
          parsed.sites.forEach((site, index) => {
            if (site && site.api && (site.type === 0 || site.type === 1 || site.type === 3)) {
              // Ensure we filter out placeholder URLs or text
              const apiStr = String(site.api).trim();
              if (apiStr.startsWith('http://') || apiStr.startsWith('https://')) {
                imported.push({
                  sourceId: `tvbox_movie_${site.key || `site-${index + 1}`}_${Date.now()}`,
                  name: site.name || `TVBox-${site.key}`,
                  sourceType: 'movie',
                  url: apiStr,
                  enabled: true,
                  status: '未测试',
                  createdAt: Date.now()
                });
              }
            }
          });
        }
        
        // 2. Convert "lives" to Live Sources
        if (Array.isArray(parsed.lives)) {
          parsed.lives.forEach((live, index) => {
            if (live) {
              const urlStr = String(live.url || '').trim();
              if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
                imported.push({
                  sourceId: `tvbox_live_${live.name || `live-${index + 1}`}_${Date.now()}`,
                  name: live.name || `TVBox直播-${index + 1}`,
                  sourceType: 'live',
                  url: urlStr,
                  enabled: true,
                  status: '未测试',
                  createdAt: Date.now()
                });
              }
            }
          });
        }
        
        if (imported.length > 0) {
          const currentSources = this.read();
          const nextSources = [...currentSources, ...imported];
          sourceRepository.saveAll(nextSources);
          return nextSources;
        }
        throw new Error('SOURCE_IMPORT_TVBOX_EMPTY');
      }
      
      return this.normalize(parsed);
    } catch (err) {
      const trimmed = text.trim();
      const fileName = file.name || 'live.txt';
      if (/#genre#/i.test(trimmed) || /^#EXTM3U/i.test(trimmed) || fileName.endsWith('.txt') || fileName.endsWith('.m3u')) {
        const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
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
    try {
      const text = await file.text();
      return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
    }
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
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
};
