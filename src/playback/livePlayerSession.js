import { PlaybackKind } from '../models/playback.js';
import { createPlaybackTask } from '../services/playbackService.js';
import { createPlaybackCore } from './playbackCore.js';
import { createLivePlayerController } from './livePlayerController.js';

let nextSessionId = 1;

export function createLivePlayerSession({ onReleased } = {}) {
  const sessionId = `live-session:${Date.now()}:${nextSessionId++}`;
  let request = null;
  let currentChannel = null;
  let currentCandidate = null;
  let videoElement = null;
  let hostElement = null;
  let presentationTarget = null;
  let released = false;

  const session = {
    sessionId,
    controller: null,
    core: null,
    task: null,

    registerVideo(element, host) {
      if (released) return null;
      videoElement = element;
      hostElement = host;
      if (!session.core && request) {
        session.createPlayback(request);
      } else if (session.core) {
        session.core.attachPlayer(videoElement);
      }
      if (presentationTarget && videoElement?.parentNode !== presentationTarget) {
        presentationTarget.appendChild(videoElement);
      }
      return videoElement;
    },

    unregisterVideo() {
      if (videoElement && hostElement && videoElement.parentNode !== hostElement) {
        hostElement.appendChild(videoElement);
      }
      videoElement = null;
      hostElement = null;
    },

    getVideoElement() {
      return videoElement;
    },

    createPlayback(nextRequest) {
      if (released || !nextRequest || nextRequest.kind !== PlaybackKind.LIVE) return null;
      request = nextRequest;
      const task = createPlaybackTask(nextRequest);
      const core = createPlaybackCore(task, {
        onResolvedInput: input => { currentCandidate = input; },
        onCandidateChange: candidate => { currentCandidate = candidate; },
      });
      session.task = task;
      session.core = core;
      session.controller = createLivePlayerController(session);
      if (videoElement) core.attachPlayer(videoElement);
      return session.controller;
    },

    ensureRequest(nextRequest) {
      if (released || !nextRequest || nextRequest.kind !== PlaybackKind.LIVE) return null;
      if (!session.core) {
        session.createPlayback(nextRequest);
        return session.start();
      }
      const nextIds = (nextRequest.candidates ?? []).map(item => item.candidateId).join('|');
      const currentIds = (request?.candidates ?? []).map(item => item.candidateId).join('|');
      if (nextRequest.channelId !== request?.channelId || nextIds !== currentIds) {
        session.setChannel(nextRequest.metadata?.channel ?? null, nextRequest);
      }
      return session.controller;
    },

    setChannel(channel, nextRequest) {
      if (released || !nextRequest) return null;
      currentChannel = channel || nextRequest.metadata?.channel || currentChannel;
      if (!session.core) {
        session.createPlayback(nextRequest);
        return session.start();
      }
      request = nextRequest;
      currentCandidate = null;
      return session.core.replaceLiveCandidates(nextRequest.candidates ?? [], {
        channelId: nextRequest.channelId,
        channel: currentChannel,
        metadata: nextRequest.metadata ?? {},
      });
    },

    start() {
      if (!session.core) return null;
      if (videoElement && !session.core.currentPlayer) session.core.attachPlayer(videoElement);
      const initial = session.core.start();
      if (initial) {
        currentCandidate = initial;
        void session.core.resolveAndLoad(initial).catch(() => {});
      }
      return session.controller;
    },

    attachPresentation(target) {
      presentationTarget = target || null;
      if (presentationTarget && videoElement) {
        session.core?.attachPresentation(presentationTarget);
      }
      return videoElement;
    },

    detachPresentation() {
      presentationTarget = null;
      if (videoElement && hostElement && videoElement.parentNode !== hostElement) {
        hostElement.appendChild(videoElement);
      }
      return videoElement;
    },

    release() {
      if (released) return;
      released = true;
      presentationTarget = null;
      try {
        if (videoElement && hostElement && videoElement.parentNode !== hostElement) {
          hostElement.appendChild(videoElement);
        }
        session.core?.release();
      } finally {
        session.controller?._dispose?.();
        session.controller = null;
        session.core = null;
        session.task = null;
        request = null;
        currentChannel = null;
        currentCandidate = null;
        onReleased?.(session);
      }
    },

    get request() { return request; },
    get currentChannel() { return currentChannel; },
    get currentCandidate() { return currentCandidate; },
    get playbackState() { return session.core?.getPlaybackState?.() ?? { state: 'idle' }; },
    get bufferState() { return session.core?.getBufferState?.() ?? { forwardSeconds: 0 }; },
  };

  return session;
}
