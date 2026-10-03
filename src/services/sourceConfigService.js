import { sourceRepository } from '../repositories/sourceRepository.js';
import { createSourceAdapters } from '../adapters/sourceAdapterFactory.js';

function validateImportedSources(value) {
  if (!Array.isArray(value)) throw new Error('SOURCE_IMPORT_ARRAY_REQUIRED');
  return value.map((source, index) => {
    if (!source || typeof source !== 'object') throw new Error(`SOURCE_IMPORT_ITEM_INVALID:${index}`);
    const sourceRef = String(source.sourceRef || source.url || '').trim();
    const isDeferredTVBoxProvider = source.adapterType === 'tvbox-live-extension'
      || source.sourceCapability === 'tvbox-live-provider';
    if (!sourceRef && !isDeferredTVBoxProvider) throw new Error(`SOURCE_IMPORT_URL_REQUIRED:${index}`);
    return source;
  });
}

function stripJSONComments(str) {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      out += char;
      i++;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      i++;
    } else if (char === '/' && nextChar === '/') {
      i += 2;
      while (i < str.length && str[i] !== '\n' && str[i] !== '\r') i++;
    } else if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += char;
      i++;
    }
  }
  return out;
}

function sanitizeJSONControlChars(str) {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
        out += char;
      } else if (char === '\n') {
        out += '\\n';
      } else if (char === '\r') {
        out += '\\r';
      } else if (char === '\t') {
        out += '\\t';
      } else if (char.charCodeAt(0) < 0x20) {
        out += ' ';
      } else {
        out += char;
      }
      i++;
      continue;
    }
    if (char === '"') inString = true;
    out += char;
    i++;
  }
  return out;
}

function cleanMismatchedBraces(str) {
  let balance = 0;
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      i++;
      continue;
    }
    if (char === '"') {
      inString = true;
      i++;
    } else if (char === '{' || char === '[') {
      balance++;
      i++;
    } else if (char === '}' || char === ']') {
      balance--;
      if (balance === 0) return str.slice(0, i + 1);
      i++;
    } else {
      i++;
    }
  }
  return str;
}

function stripTrailingCommas(str) {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      out += char;
      i++;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      i++;
      continue;
    }
    if (char === ',') {
      let j = i + 1;
      while (j < str.length && /\s/.test(str[j])) j++;
      if (str[j] === '}' || str[j] === ']') {
        i++;
        continue;
      }
    }
    out += char;
    i++;
  }
  return out;
}

function parseRelaxedJSON(text) {
  const cleaned = stripTrailingCommas(cleanMismatchedBraces(sanitizeJSONControlChars(stripJSONComments(String(text).trim()))));
  return JSON.parse(cleaned);
}

function stableHash(value) {
  let hash = 2166136261;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createBundleId(name) {
  return `bundle_local_${stableHash(String(name || '').trim().toLowerCase())}`;
}

function createLocalSource({ name, sourceType, text, format, liveMode, bundleId }) {
  const resolvedBundleId = bundleId || createBundleId(name, text);
  const sourceId = `source_${stableHash(`${resolvedBundleId}|${sourceType}|${name}`)}`;
  return {
    sourceId,
    bundleId: resolvedBundleId,
    sourceKey: `local|${sourceType}|${stableHash(name)}`,
    name,
    sourceType,
    sourceRef: `local://${encodeURIComponent(name)}`,
    url: `local://${encodeURIComponent(name)}`,
    localContent: text,
    localFormat: format,
    ...(sourceType === 'live' && liveMode ? { liveMode } : {}),
    enabled: true,
    status: '未测试',
    createdAt: Date.now(),
  };
}

function resolveLiveSourceRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^proxy:\/\//i.test(raw)) {
    const match = raw.match(/(?:[?&]|^)ext=(.+)$/i);
    if (!match) return '';
    try {
      const decoded = decodeURIComponent(match[1]);
      return /^https?:\/\//i.test(decoded) ? decoded : '';
    } catch {
      return '';
    }
  }
  return '';
}

function classifyTVBoxSite(site = {}) {
  const name = String(site.name || '').trim();
  const key = String(site.key || '').trim();
  const api = String(site.api || '').trim();
  const ext = String(site.ext || '').trim();
  const text = `${name} ${key} ${api} ${ext}`;
  // TVBox 的 `sites` 通常是影视站点，但部分配置会把 Drpy/直播脚本
  // 混在 sites 中。只有出现明确的直播标记时才拆到 Live，避免误伤普通影视源。
  const explicitLive = /(直播|体育赛事|赛事直播|网红直播|310直播)/i.test(text)
    || /(?:直播|sports|justlive)\\.(?:js|py|json)(?:$|[?#])/i.test(text);
  return explicitLive ? 'live' : 'movie';
}

function classifyTVBoxCapability(site = {}) {
  const api = String(site.api || '').trim();
  const type = Number(site.type);
  const hasJar = site.jar != null && String(site.jar).trim() !== '';
  const hasExt = site.ext != null;
  const isDrpy = /^drpy(?:_js)?_/i.test(String(site.key || ''))
    || /(?:^|\/)drpy2(?:\.min)?\.js(?:$|[?#])/i.test(api);
  const isCsp = /^csp_/i.test(api);
  const isDirectVod = type === 1
    && /^https?:\/\//i.test(api)
    && /(?:api\.php\/)?provide\/vod(?:\/|\?|$)/i.test(api);

  if (isDirectVod) {
    return {
      sourceCapability: 'direct-http-vod',
      adapterType: 'http-vod',
      requiresJar: hasJar,
      kind: hasJar ? 'http-vod-with-jar' : 'http-vod',
    };
  }
  if (isDrpy) {
    return {
      sourceCapability: 'tvbox-drpy-js',
      adapterType: 'tvbox-extension',
      requiresJar: hasJar,
      kind: 'drpy-js',
    };
  }
  if (isCsp) {
    return {
      sourceCapability: 'tvbox-csp',
      adapterType: 'tvbox-extension',
      requiresJar: hasJar,
      kind: 'csp',
    };
  }
  if (hasJar) {
    return {
      sourceCapability: 'tvbox-jar',
      adapterType: 'tvbox-extension',
      requiresJar: true,
      kind: 'jar',
    };
  }
  if (hasExt) {
    return {
      sourceCapability: 'tvbox-ext',
      adapterType: 'tvbox-extension',
      requiresJar: false,
      kind: 'ext',
    };
  }
  return {
    sourceCapability: 'tvbox-extension',
    adapterType: 'tvbox-extension',
    requiresJar: false,
    kind: 'unknown',
  };
}

function isSafeTVBoxExtJson(site = {}) {
  const ext = site?.ext;
  if (ext && typeof ext === 'object' && !Array.isArray(ext)) {
    const serialized = JSON.stringify(ext);
    return serialized.length <= 5 * 1024 * 1024
      && (Array.isArray(ext.movies) || Array.isArray(ext.vod) || Array.isArray(ext.list)
        || Array.isArray(ext.data) || Array.isArray(ext.result)
        || Array.isArray(ext.data?.list) || Array.isArray(ext.result?.list));
  }
  if (typeof ext !== 'string') return false;
  const value = ext.trim();
  if (/^https?:\/\//i.test(value)) return /\.json(?:[?#].*)?$/i.test(value);
  return (value.startsWith('{') || value.startsWith('[')) && value.length <= 5 * 1024 * 1024;
}

function isDirectMovieEndpoint(api, site = {}) {
  return classifyTVBoxCapability({ ...site, api }).sourceCapability === 'direct-http-vod';
}

function parseTVBoxSources(parsed, { bundleId = null } = {}) {
  const imported = [];
  const resolvedBundleId = bundleId || `bundle_tvbox_${stableHash(JSON.stringify(parsed))}`;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return imported;

  if (Array.isArray(parsed.sites)) {
    parsed.sites.forEach((site, index) => {
      if (!site || typeof site !== 'object') return;

      const api = String(site.api || '').trim();
      const sourceType = classifyTVBoxSite(site);
      const capability = classifyTVBoxCapability(site);
      const directMovie = capability.sourceCapability === 'direct-http-vod';
      const safeExtJson = sourceType === 'movie' && capability.kind === 'ext' && isSafeTVBoxExtJson(site);
      const isSupportedDirect = sourceType === 'movie' && directMovie;
      const isTVBoxLiveProvider = sourceType === 'live' && capability.adapterType === 'tvbox-extension';
      const adapterType = isTVBoxLiveProvider ? 'tvbox-live-extension' : capability.adapterType;

      const sourceId = `tvbox_${sourceType}_${stableHash(`${resolvedBundleId}|${sourceType}|${site.key || api || index}`)}`;
      const name = String(site.name || site.key || `TVBox${sourceType === 'live' ? '直播' : '影视'}-${index + 1}`).trim();

      imported.push({
        sourceId,
        bundleId: resolvedBundleId,
        sourceKey: `${sourceType}|${site.key || api || index}`,
        name,
        sourceType,
        sourceRef: isTVBoxLiveProvider ? '' : api,
        url: isTVBoxLiveProvider ? '' : api,
        // “导入”与“当前运行时是否支持”必须分离：
        // 导入后所有合法 site 都保留并默认启用；真正请求时由 movieSourceService
        // 再依据 sourceCapability/adapterType 判断是否存在可执行适配器。
        enabled: true,
        status: isSupportedDirect || safeExtJson ? '未测试' : '待适配',
        runtimeSupported: isSupportedDirect || safeExtJson,
        sourceCapability: isTVBoxLiveProvider ? 'tvbox-live-provider' : capability.sourceCapability,
        adapterType,
        tvboxAdapterKind: capability.kind,
        tvboxRequiresJar: capability.requiresJar === true,
        tvboxType: Number.isFinite(Number(site.type)) ? Number(site.type) : null,
        tvboxKey: String(site.key || '').trim(),
        tvboxApi: api,
        tvboxDefinition: { ...site },
        ...(isTVBoxLiveProvider ? { tvboxLiveProvider: true } : {}),
        tvboxUnsupportedReason: isSupportedDirect || safeExtJson ? null : (
          isTVBoxLiveProvider ? 'TVBox Live Provider 当前未适配执行器' :
          !api ? '缺少 api' :
            capability.kind === 'drpy-js' ? 'Drpy JS 源当前未适配执行器'
            : capability.kind === 'csp' ? 'CSP 源当前未适配执行器'
            : capability.kind === 'jar' || capability.kind === 'http-vod-with-jar' ? '该源依赖 JAR 扩展，已进入 CatVod Spider 执行阶段；首次请求时自动准备并校验 JAR'
            : capability.kind === 'ext' ? '该源依赖 ext 扩展配置，当前未适配'
            : '当前源不是标准可直接请求的 VOD HTTP 接口'
        ),
        ...(site.jar != null ? { tvboxJar: site.jar } : {}),
        ...(site.ext != null ? { tvboxExt: site.ext } : {}),
        createdAt: Date.now(),
      });
    });
  }

  if (Array.isArray(parsed.lives)) {
    parsed.lives.forEach((live, index) => {
      const liveName = String(live?.name || `TVBox直播-${index + 1}`).trim();
      const candidates = [];
      const addLiveRef = (value) => {
        const sourceRef = resolveLiveSourceRef(value);
        if (sourceRef) candidates.push(sourceRef);
      };
      addLiveRef(live?.url);
      if (Array.isArray(live?.urls)) live.urls.forEach(addLiveRef);
      if (Array.isArray(live?.channels)) {
        live.channels.forEach(channel => {
          if (Array.isArray(channel?.urls)) channel.urls.forEach(addLiveRef);
          addLiveRef(channel?.url);
        });
      }
      [...new Set(candidates)].forEach((sourceRef, refIndex) => {
        imported.push({
          sourceId: `tvbox_live_${stableHash(`${resolvedBundleId}|live|${live.key || live.name || index}|${sourceRef}`)}`,
          bundleId: resolvedBundleId,
          sourceKey: `live|${live.key || live.name || index}|${sourceRef}`,
          name: candidates.length > 1 ? `${liveName} · 线路 ${refIndex + 1}` : liveName,
          sourceType: 'live',
          sourceRef,
          url: sourceRef,
          liveMode: /\.txt(?:[?#]|$)/i.test(sourceRef) ? 'tv1' : 'generic',
          enabled: true,
          status: '未测试',
          sourceCapability: 'direct-live',
          adapterType: 'live-reference',
          createdAt: Date.now(),
        });
      });
    });
  }
  return imported;
}

export const sourceConfigService = {
  read() {
    return sourceRepository.getAll();
  },

  createAdapters(options = {}) {
    return createSourceAdapters(this.read(), options);
  },

  normalize(sources) {
    return sourceRepository.saveAll(validateImportedSources(sources)) || sourceRepository.getAll();
  },

  async parseLocalFile(file) {
    if (!file || typeof file.text !== 'function') throw new Error('SOURCE_IMPORT_FILE_REQUIRED');
    const text = await file.text();
    const trimmed = text.replace(/^\uFEFF/, '').trim();
    const fileName = String(file.name || 'source').trim();
    const lowerName = fileName.toLowerCase();
    const bundleId = createBundleId(fileName, text);

    if (lowerName.endsWith('.txt') || lowerName.endsWith('.m3u') || /#genre#/i.test(trimmed) || /^#EXTM3U/i.test(trimmed)) {
      return [createLocalSource({
        name: fileName.replace(/\.[^.]+$/, '') || '本地直播源',
        sourceType: 'live',
        text,
        format: lowerName.endsWith('.m3u') || /^#EXTM3U/i.test(trimmed) ? 'm3u' : 'txt',
        liveMode: /#genre#/i.test(trimmed) ? 'tv1' : 'generic',
        bundleId,
      })];
    }

    let parsed;
    try {
      parsed = parseRelaxedJSON(text);
    } catch (error) {
      throw new Error(`SOURCE_IMPORT_JSON_INVALID:${error?.message || 'parse failed'}`);
    }

    const tvboxSources = parseTVBoxSources(parsed, { bundleId });
    if (tvboxSources.length) return tvboxSources;

    if (Array.isArray(parsed)) {
      return [createLocalSource({
        name: fileName.replace(/\.[^.]+$/, '') || '本地影视源',
        sourceType: 'movie',
        text,
        format: 'json',
        bundleId,
      })];
    }

    throw new Error('SOURCE_IMPORT_TVBOX_EMPTY');
  },

  async importFile(file) {
    const parsedSources = await this.parseLocalFile(file);
    const currentSources = this.read();
    const importedBundleIds = new Set(parsedSources.map(source => source.bundleId).filter(Boolean));
    const replacedSources = currentSources.filter(source => importedBundleIds.has(source.bundleId));
    const previousById = new Map(replacedSources.map(source => [source.sourceId, source]));
    const normalizedImportedSources = parsedSources.map(source => {
      const previous = previousById.get(source.sourceId);
      if (!previous) return source;
      return {
        ...source,
        enabled: previous.enabled !== false,
        isActive: previous.isActive === true,
        createdAt: previous.createdAt || source.createdAt,
      };
    });
    const importedIdentities = new Set(
      normalizedImportedSources.map(source => `${source.sourceType}|${source.sourceRef || source.url || ''}`),
    );
    const retainedSources = currentSources.filter(source => {
      if (importedBundleIds.has(source.bundleId)) return false;
      const identity = `${source.sourceType}|${source.sourceRef || source.url || ''}`;
      return !importedIdentities.has(identity);
    });
    const nextSources = [...retainedSources, ...normalizedImportedSources];
    sourceRepository.saveAll(nextSources);
    return nextSources;
  },

  async readFileAsDataURL(file) {
    if (!file || typeof file.text !== 'function') throw new Error('SOURCE_IMPORT_FILE_REQUIRED');
    const text = await file.text();
    return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
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
  },
};
