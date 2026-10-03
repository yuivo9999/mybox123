import { createTVBoxJarRuntime } from './tvboxJarRuntime.js';
import { parseTVBoxResult } from '../movie/jsonParser.js';
import { normalizeMovie } from '../movie/normalizeMovie.js';

export function createTVBoxJarAdapter(config = {}, runtime = null) {
  const effectiveRuntime = runtime ?? createTVBoxJarRuntime();
  const sourceId = String(config.sourceId || '').trim();
  if (!sourceId) throw new Error('TVBOX_JAR_SOURCE_ID_REQUIRED');

  const definition = Object.freeze({
    sourceId,
    name: String(config.name || sourceId),
    sourceType: String(config.sourceType || 'movie'),
    kind: 'jar',
    tvboxJar: config.tvboxJar ?? null,
    tvboxDefinition: config.tvboxDefinition ?? null,
  });

  const execute = async (operation, payload = {}) => {
    if (!effectiveRuntime?.isAvailable?.()) {
      throw new Error('TVBOX_JAR_RUNTIME_UNAVAILABLE');
    }
    return effectiveRuntime.execute({ operation, payload });
  };

  let preparedPath = '';
  const prepare = async (payload = {}) => execute('prepare', {
    ...payload,
    name: payload.name || definition.name,
    url: payload.url || (typeof definition.tvboxJar === 'string' ? definition.tvboxJar : ''),
  });

  const inspect = async (payload = {}) => execute('inspect', payload);

  const ensurePrepared = async (payload = {}) => {
    if (payload.path) return payload.path;
    if (preparedPath) return preparedPath;
    const result = await prepare(payload);
    preparedPath = String(result?.path || '');
    if (!preparedPath) throw new Error('TVBOX_JAR_PREPARE_PATH_MISSING');
    return preparedPath;
  };

  const invoke = async (operation, payload = {}) => execute(operation, {
    ...payload,
    path: payload.path || preparedPath || '',
    className: payload.className || '',
    ext: payload.ext ?? definition.tvboxDefinition?.ext ?? '',
  });

  const home = async (payload = {}) => invoke('home', { ...payload, path: await ensurePrepared(payload) });
  const category = async (payload = {}) => invoke('category', { ...payload, path: await ensurePrepared(payload) });
  const detail = async (payload = {}) => invoke('detail', { ...payload, path: await ensurePrepared(payload) });
  const search = async (payload = {}) => invoke('search', { ...payload, path: await ensurePrepared(payload) });
  const play = async (payload = {}) => invoke('play', { ...payload, path: await ensurePrepared(payload) });

  const normalizeResult = (result) => {
    const raw = result?.result ?? result;
    const items = parseTVBoxResult(raw);
    return items.map((item, index) => normalizeMovie({
      sourceId,
      item,
      index,
      sourceMetadata: {
        sourceCapability: 'tvbox-jar',
        adapterType: 'tvbox-extension',
        tvboxAdapterKind: 'jar',
        tvboxRequiresJar: true,
        tvboxJar: definition.tvboxJar,
      },
    }));
  };

  const getMovies = async (payload = {}) => normalizeResult(await home(payload));
  const searchMovies = async (payload = {}) => normalizeResult(await search(payload));
  const getCategory = async (payload = {}) => normalizeResult(await category(payload));
  const getDetail = async (payload = {}) => normalizeResult(await detail(payload));

  return {
    sourceId,
    definition,
    isRuntimeAvailable: () => Boolean(effectiveRuntime?.isAvailable?.()),
    getCapabilities: () => effectiveRuntime?.getCapabilities?.() || { available: false },
    prepare,
    inspect,
    invoke,
    home,
    category,
    detail,
    search,
    play,
    normalizeResult,
    getMovies,
    searchMovies,
    getCategory,
    getDetail,
    execute,
  };
}
