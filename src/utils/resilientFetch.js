/**
 * Resilient Fetch Utility
 * - Prevents indefinite hanging with automatic timeout (default 8s)
 * - Detects and bypasses browser CORS & Mixed-Content blocks
 * - Fallbacks to reliable CORS proxies (corsproxy.io -> allorigins)
 */

const DEFAULT_TIMEOUT_MS = 8000;

function isMixedContent(url) {
  if (typeof window === 'undefined' || !window.location) return false;
  return window.location.protocol === 'https:' && url.startsWith('http://');
}

export async function resilientFetch(url, options = {}, transport = fetch) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL_REQUIRED');
  }

  const trimmedUrl = url.trim();

  // Local data or blob URLs do not need proxies or timeouts
  if (trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:')) {
    return transport(trimmedUrl, options);
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const userSignal = options.signal;

  const createTimedSignal = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('TIMEOUT')), timeoutMs);

    if (userSignal) {
      userSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.abort(userSignal.reason);
      });
    }

    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
  };

  const proxies = [
    (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  ];

  // If running on HTTPS and target is HTTP, direct fetch will be blocked by Mixed Content
  const mustProxy = isMixedContent(trimmedUrl);

  if (!mustProxy) {
    const { signal, cleanup } = createTimedSignal();
    try {
      const response = await transport(trimmedUrl, {
        ...options,
        signal,
      });
      cleanup();
      if (response && response.ok) {
        return response;
      }
    } catch {
      cleanup();
      // Proceed to proxy fallback
    }
  }

  // Attempt proxy fallbacks
  let lastError = null;
  for (const getProxyUrl of proxies) {
    const proxyUrl = getProxyUrl(trimmedUrl);
    const { signal, cleanup } = createTimedSignal();
    try {
      const response = await transport(proxyUrl, {
        headers: {},
        signal,
      });
      cleanup();
      if (response && (response.ok || response.status === 200 || response.status === 206)) {
        return response;
      }
    } catch (err) {
      cleanup();
      lastError = err;
    }
  }

  throw lastError || new Error('FETCH_FAILED');
}
