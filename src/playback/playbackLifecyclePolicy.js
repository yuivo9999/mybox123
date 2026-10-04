import { PlaybackKind } from '../models/playback.js';

export function createPlaybackLifecyclePolicy({ kind } = {}) {
  const playbackKind = kind ?? PlaybackKind.VOD;
  const isLive = playbackKind === PlaybackKind.LIVE;

  return Object.freeze({
    onPageLeave: isLive ? 'detach' : 'release',
    onBackground: 'pause',
    shouldReleaseOnLeave: !isLive,
    shouldDetachOnLeave: isLive,
  });
}
