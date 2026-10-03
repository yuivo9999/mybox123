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

  return {
    sourceId,
    definition,
    isRuntimeAvailable: () => Boolean(effectiveRuntime?.isAvailable?.()),
    getCapabilities: () => effectiveRuntime?.getCapabilities?.() || { available: false },
    prepare,
    inspect,
    execute,
  };
}
