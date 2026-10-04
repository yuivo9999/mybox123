import { PlaybackKind } from '../models/playback.js';

export function createPlaybackContext({
  kind = PlaybackKind.VOD,
  contentId = null,
  episodeId = null,
  episodeIndex = 0,
  channelId = null,
  streamId = null,
  sourceId = null,
  candidateId = null,
  returnRoute = null,
  returnTab = null,
  startPositionSeconds = 0,
} = {}) {
  return Object.freeze({
    kind: kind === PlaybackKind.LIVE ? PlaybackKind.LIVE : PlaybackKind.VOD,
    contentId: contentId ?? null,
    episodeId: episodeId ?? null,
    episodeIndex: Number.isFinite(episodeIndex) ? episodeIndex : 0,
    channelId: channelId ?? null,
    streamId: streamId ?? null,
    sourceId: sourceId ?? null,
    candidateId: candidateId ?? null,
    returnRoute: returnRoute ?? null,
    returnTab: returnTab ?? null,
    startPositionSeconds: Number.isFinite(startPositionSeconds) ? startPositionSeconds : 0,
  });
}

export function getPlaybackContext(request) {
  if (request?.context) return request.context;
  return createPlaybackContext({
    kind: request?.kind,
    contentId: request?.contentId,
    episodeId: request?.episodeId,
    channelId: request?.channelId,
    sourceId: request?.metadata?.sourceId,
    returnRoute: request?.metadata?.returnRoute,
    startPositionSeconds: request?.metadata?.startPositionSeconds,
    episodeIndex: request?.metadata?.episodeIndex,
  });
}


export function resolvePlaybackReturnRoute({ explicit = null, currentRoute = null, currentTab = null, fallback = 'home' } = {}) {
  if (explicit) return explicit;
  if (currentRoute === 'detail' || currentRoute === 'search' || currentRoute === 'history' || currentRoute === 'movies') return currentRoute;
  if (currentTab === 'movies') return 'movies';
  if (currentTab === 'history') return 'history';
  return fallback;
}

export function resolvePlaybackReturnTarget(request, { fallbackTab = 'home' } = {}) {
  const context = getPlaybackContext(request);
  const returnRoute = context.returnRoute || context.returnTab || fallbackTab;
  if (returnRoute === 'detail') return { tab: context.returnTab || 'movies', route: 'detail', selected: request ?? null };
  if (returnRoute === 'search') return { tab: context.returnTab || 'movies', route: 'search', selected: null };
  if (returnRoute === 'history') return { tab: 'history', route: null, selected: null };
  if (returnRoute === 'movies') return { tab: context.returnTab || 'movies', route: null, selected: null };
  return { tab: context.returnTab || fallbackTab, route: null, selected: null };
}
