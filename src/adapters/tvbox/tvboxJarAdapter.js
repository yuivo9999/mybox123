import { createTVBoxJarRuntime } from './tvboxJarRuntime.js';

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

  const prepare = async (payload = {}) => execute('prepare', {
    ...payload,
    name: payload.name || definition.name,
    url: payload.url || (typeof definition.tvboxJar === 'string' ? definition.tvboxJar : ''),
  });

  const inspect = async (payload = {}) => execute('inspect', payload);

  const invoke = async (operation, payload = {}) => execute(operation, {
    ...payload,
    path: payload.path || '',
    className: payload.className || '',
    ext: payload.ext ?? definition.tvboxDefinition?.ext ?? '',
  });

  const home = (payload = {}) => invoke('home', payload);
  const category = (payload = {}) => invoke('category', payload);
  const detail = (payload = {}) => invoke('detail', payload);
  const search = (payload = {}) => invoke('search', payload);
  const play = (payload = {}) => invoke('play', payload);

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
    execute,
  };
}
