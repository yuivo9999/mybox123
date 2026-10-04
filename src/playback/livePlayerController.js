export function createLivePlayerController(session) {
  let state = 'idle';
  const listeners = new Set();
  const unsubscribeCore = session.core?.subscribe?.(event => {
    if (event.event === 'stateChanged') state = event.state;
    listeners.forEach(listener => listener(event));
  });

  const notify = event => listeners.forEach(listener => listener(event));

  return Object.freeze({
    get sessionId() { return session.sessionId; },
    get state() { return session.core?.state ?? state; },
    get failedCandidateIds() { return session.core?.task?.failedCandidateIds ?? []; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attachPresentation(target) { return session.attachPresentation(target); },
    detachPresentation() { return session.detachPresentation(); },
    start() { return session.start(); },
    ensureRequest(request) { return session.ensureRequest(request); },
    setChannel(channel, request) { return session.setChannel(channel, request); },
    resolveAndLoad(candidate, options) { return session.core?.resolveAndLoad(candidate, options); },
    switchCandidate(id) { return session.core?.switchCandidate(id); },
    replaceLiveCandidates(candidates, metadata) { return session.core?.replaceLiveCandidates(candidates, metadata); },
    switchEpisode(...args) { return session.core?.switchEpisode(...args); },
    play() { return session.core?.play(); },
    pause() { return session.core?.pause(); },
    seek(seconds) { return session.core?.seek(seconds); },
    setPlaybackRate(rate) { return session.core?.setPlaybackRate(rate); },
    setVolume(value) { return session.core?.setVolume(value); },
    getPlaybackState() { return session.core?.getPlaybackState?.() ?? { state }; },
    getBufferState() { return session.core?.getBufferState?.() ?? { forwardSeconds: 0 }; },
    getAudioTracks() { return session.core?.getAudioTracks?.() ?? []; },
    selectAudioTrack(id) { return session.core?.selectAudioTrack?.(id) ?? false; },
    getSubtitleTracks() { return session.core?.getSubtitleTracks?.() ?? []; },
    selectSubtitleTrack(id) { return session.core?.selectSubtitleTrack?.(id) ?? false; },
    getQualities() { return session.core?.getQualities?.() ?? []; },
    selectQuality(id) { return session.core?.selectQuality?.(id) ?? false; },
    getVideoElement() { return session.getVideoElement(); },
    setVideoViewBounds(bounds) { return session.core?.setVideoViewBounds(bounds); },
    handleAppState(value) { return session.core?.handleAppState(value); },
    stop() { return session.release(); },
    release() { return session.release(); },
    leave() { return session.detachPresentation(); },
    _notify: notify,
    _dispose() { unsubscribeCore?.(); listeners.clear(); },
  });
}
