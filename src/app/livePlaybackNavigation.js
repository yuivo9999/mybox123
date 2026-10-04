export function getLivePlaybackReturnRoute({ route, selected } = {}) {
  if (route === 'live-channel') return 'live-channel';
  if (route === 'live-play') return selected?.metadata?.returnRoute || 'live-channel';
  return null;
}
