import { ErrorCode, toAppError } from '../../models/errors.js';
import { createTVBoxNativeRuntime } from './tvboxNativeRuntime.js';

/**
 * TVBox 扩展执行器的统一边界。
 *
 * 重要：CSP / Drpy / JAR / ext 都可能包含任意站点逻辑，不能在 React/WebView
 * 环境中直接 eval。真正执行应由 Android 原生扩展运行时实现，再通过受控 bridge
 * 返回标准化结果。
 */
export const TVBOX_EXTENSION_KIND = Object.freeze({
  CSP: 'csp',
  DRPY_JS: 'drpy-js',
  JAR: 'jar',
  EXT: 'ext',
  UNKNOWN: 'unknown',
});

export const TVBOX_EXTENSION_ERROR = 'TVBOX_EXTENSION_RUNTIME_UNAVAILABLE';

export function createTVBoxExtensionAdapter(config = {}, runtime = null) {
  const effectiveRuntime = runtime ?? createTVBoxNativeRuntime();
  const sourceId = String(config.sourceId || '').trim();
  const kind = String(config.tvboxAdapterKind || 'unknown').trim() || 'unknown';

  if (!sourceId) throw new Error('TVBOX_EXTENSION_SOURCE_ID_REQUIRED');

  const definition = Object.freeze({
    sourceId,
    name: String(config.name || sourceId),
    sourceType: String(config.sourceType || 'movie'),
    sourceCapability: String(config.sourceCapability || 'tvbox-extension'),
    adapterType: String(config.adapterType || 'tvbox-extension'),
    kind,
    tvboxApi: config.tvboxApi ?? '',
    tvboxExt: config.tvboxExt ?? null,
    tvboxJar: config.tvboxJar ?? null,
    tvboxDefinition: config.tvboxDefinition ?? null,
  });

  const unavailable = (operation) => toAppError(
    new Error(TVBOX_EXTENSION_ERROR),
    {
      code: ErrorCode.SOURCE,
      scope: 'tvbox-extension-runtime',
      context: {
        sourceId,
        kind,
        operation,
      },
    },
  );

  const execute = async (operation, payload = {}, options = {}) => {
    if (!effectiveRuntime || typeof effectiveRuntime.execute !== 'function') {
      throw unavailable(operation);
    }

    return runtime.execute({
      definition,
      operation,
      payload,
      signal: options.signal,
    });
  };

  const healthCheck = async (options = {}) => {
    try {
      await execute('healthCheck', {}, options);
      return {
        ok: true,
        sourceId,
        status: 'healthy',
        checkedAt: Date.now(),
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        sourceId,
        status: effectiveRuntime ? 'error' : 'unsupported',
        checkedAt: Date.now(),
        error: toAppError(error, { context: { sourceId, kind } }),
      };
    }
  };

  return {
    sourceId,
    definition,
    isRuntimeAvailable: () => Boolean(effectiveRuntime && typeof effectiveRuntime.execute === 'function'),
    healthCheck,
    execute,
    load: (payload, options) => execute('load', payload, options),
    search: (payload, options) => execute('search', payload, options),
    detail: (payload, options) => execute('detail', payload, options),
    episodes: (payload, options) => execute('episodes', payload, options),
    playUrl: (payload, options) => execute('playUrl', payload, options),
  };
}
