export const ParserErrorCode = Object.freeze({
  INPUT_INVALID: 'InputInvalid',
  PARSER_NOT_MATCHED: 'ParserNotMatched',
  MANIFEST_ERROR: 'ManifestError',
  SESSION_EXPIRED: 'SessionExpired',
  NETWORK_ERROR: 'NetworkError',
  UNSUPPORTED_MEDIA: 'UnsupportedMedia',
});

export const MediaProtocol = Object.freeze({
  HTTP: 'http',
  HTTPS: 'https',
  HLS: 'hls',
  DASH: 'dash',
  MP4: 'mp4',
  TS: 'ts',
  FLV: 'flv',
});

export function createResolvedMediaInput(input = {}) {
  const url = String(input.url ?? input.mediaUrl ?? '').trim();
  if (!url) throw new Error(ParserErrorCode.INPUT_INVALID);
  return {
    url,
    protocol: String(input.protocol ?? inferMediaProtocol(url)).toLowerCase(),
    headers: { ...(input.headers ?? {}) },
    cookies: String(input.cookies ?? ''),
    referer: String(input.referer ?? ''),
    userAgent: String(input.userAgent ?? ''),
    token: input.token ?? undefined,
    expiresAt: input.expiresAt ?? undefined,
    session: input.session ? { ...input.session } : undefined,
    playerHint: input.playerHint ?? undefined,
    parserHint: input.parserHint ?? undefined,
    metadata: { ...(input.metadata ?? {}) },
  };
}

export function inferMediaProtocol(url = '') {
  const value = String(url).trim().toLowerCase();
  if (/\.m3u8(?:$|[?#])/.test(value)) return MediaProtocol.HLS;
  if (/\.mpd(?:$|[?#])/.test(value)) return MediaProtocol.DASH;
  if (/\.mp4(?:$|[?#])/.test(value)) return MediaProtocol.MP4;
  if (/\.ts(?:$|[?#])/.test(value)) return MediaProtocol.TS;
  if (/\.flv(?:$|[?#])/.test(value)) return MediaProtocol.FLV;
  if (value.startsWith('https://')) return MediaProtocol.HTTPS;
  return MediaProtocol.HTTP;
}
