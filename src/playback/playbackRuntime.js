import { createLivePlayerSession } from './livePlayerSession.js';

let liveSession = null;
let liveVideoElement = null;
let liveHostElement = null;

export const playbackRuntime = {
  getLivePlayerSession(request = null) {
    if (!liveSession) {
      liveSession = createLivePlayerSession({
        onReleased(session) {
          if (liveSession === session) liveSession = null;
        },
      });
    }
    if (liveVideoElement) {
      liveSession.registerVideo(liveVideoElement, liveHostElement);
    }
    if (request) liveSession.ensureRequest(request);
    return liveSession;
  },

  registerLivePlayerElement(element, host) {
    liveVideoElement = element;
    liveHostElement = host;
    if (liveSession) {
      liveSession.registerVideo(element, host);
    }
    return element;
  },

  unregisterLivePlayerElement(element) {
    if (liveVideoElement !== element) return;
    liveSession?.detachPresentation();
    liveSession?.release();
    liveVideoElement = null;
    liveHostElement = null;
  },

  get liveSession() {
    return liveSession;
  },
};
