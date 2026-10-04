import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playbackService } from '../services/playbackService.js';

function getPlaybackRequestKey(request) {
  if (!request) return '';
  return JSON.stringify({
    contentId: request.contentId ?? null,
    episodeId: request.episodeId ?? null,
    channelId: request.channelId ?? null,
    startPositionSeconds: request.metadata?.startPositionSeconds ?? null,
    candidates: (request.candidates ?? []).map(candidate => ({
      candidateId: candidate.candidateId ?? null,
      sourceId: candidate.sourceId ?? null,
      mediaUrl: candidate.mediaUrl ?? candidate.url ?? candidate.metadata?.url ?? null,
      protocol: candidate.protocol ?? null,
    })),
  });
}

/**
 * Shared playback lifecycle for VOD and immersive Live playback pages.
 * UI components should consume the returned state/actions instead of creating
 * their own controller lifecycle.
 */
export function usePlaybackController({
  request,
  videoRef,
  recordProgress,
  isLive = false,
  onEvent,
} = {}) {
  const progressRef = useRef({ currentTime: 0, duration: null, persistedAt: 0, completed: false });
  const onEventRef = useRef(onEvent);
  const recordProgressRef = useRef(recordProgress);
  const requestKeyRef = useRef(getPlaybackRequestKey(request));
  const requestKey = getPlaybackRequestKey(request);
  const requestSnapshot = request;

  if (requestKeyRef.current !== requestKey) {
    requestKeyRef.current = requestKey;
  }

  useEffect(() => {
    // React runs the previous lifecycle cleanup before this new effect setup.
    // Reset here so the previous episode can persist its final progress first.
    progressRef.current = { currentTime: 0, duration: null, persistedAt: 0, completed: false };
    setPlaybackMetrics({ currentTime: 0, duration: 0 });
  }, [requestKey]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    recordProgressRef.current = recordProgress;
  }, [recordProgress]);

  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [status, setStatus] = useState('idle');
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const [playbackMetrics, setPlaybackMetrics] = useState({ currentTime: 0, duration: 0 });

  const reportError = useCallback((message) => {
    setError(message || '');
  }, []);

  const controller = useMemo(() => {
    const isCurrentLifecycle = () => requestKeyRef.current === requestKey;
    return playbackService.createController(requestSnapshot, {
    onEvent: event => {
      // A controller can finish an async parse/load after the page has already
      // switched to another request. Ignore late events from the old lifecycle.
      if (!isCurrentLifecycle()) return;
      onEventRef.current?.(event);
      const currentRequest = requestSnapshot;
      if (event.event === 'error') {
        reportError(event.error || '播放候选失败');
      }
      if (!isLive && event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
        progressRef.current = { ...progressRef.current, currentTime, duration };
        setPlaybackMetrics({ currentTime, duration: Number.isFinite(duration) ? duration : 0 });
        if (
          currentRequest?.contentId &&
          currentRequest?.episodeId &&
          typeof recordProgressRef.current === 'function' &&
          currentTime - progressRef.current.persistedAt >= 15
        ) {
          recordProgressRef.current(
            currentRequest.contentId,
            currentRequest.episodeId,
            currentTime,
            duration,
            false,
          );
          progressRef.current.persistedAt = currentTime;
        }
      }
      if (!isLive && event.event === 'completed' && currentRequest?.contentId && currentRequest?.episodeId) {
        progressRef.current = { ...progressRef.current, completed: true };
        const progress = progressRef.current;
        if (progress.currentTime > 0 && typeof recordProgressRef.current === 'function') {
          recordProgressRef.current(
            currentRequest.contentId,
            currentRequest.episodeId,
            progress.currentTime,
            progress.duration,
            true,
          );
        }
      }
    },
    onStateChange: nextStatus => {
      if (isCurrentLifecycle()) setStatus(nextStatus);
    },
    onCandidateChange: next => {
      if (!isCurrentLifecycle()) return;
      setCandidate(next);
      setResolvedInput(null);
      if (next) setError('');
    },
    onResolvedInput: input => {
      if (isCurrentLifecycle()) setResolvedInput(input);
    },
    onParserError: ({ code }) => {
      if (isCurrentLifecycle()) reportError('解析失败：' + code);
    },
    onPlayerError: ({ error: playerError }) => {
      if (isCurrentLifecycle()) reportError(playerError?.message || '播放器加载失败');
    },
    onExhausted: () => {
      if (isCurrentLifecycle()) setStatus('error');
    },
  });
  }, [requestKey, isLive, reportError]);

  useEffect(() => {
    if (!request || !videoRef?.current || !controller) return undefined;
    let active = true;
    const onVisibility = () => {
      controller.handleAppState?.(document.visibilityState === 'hidden' ? 'background' : 'foreground');
    };
    document.addEventListener('visibilitychange', onVisibility);

    const player = controller.attachPlayer(videoRef.current);
    const initial = controller.start();
    setCandidate(initial);

    if (!initial) {
      setStatus('error');
      reportError('没有可用的播放候选');
    } else {
      controller.resolveAndLoad(initial).catch(errorValue => {
        if (active && requestKeyRef.current === requestKey) {
          reportError(errorValue?.message || '播放初始化失败');
        }
      });
    }

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      const currentRequest = requestSnapshot;
      if (
        !isLive
        && currentRequest?.contentId
        && currentRequest?.episodeId
        && progressRef.current.currentTime > 0
        && !progressRef.current.completed
        && typeof recordProgressRef.current === 'function'
      ) {
        const progress = progressRef.current;
        recordProgressRef.current(
          currentRequest.contentId,
          currentRequest.episodeId,
          progress.currentTime,
          progress.duration,
          false,
        );
      }
      controller.leave();
      void player;
    };
  }, [controller, requestKey, videoRef, isLive, reportError]);

  const switchCandidate = useCallback((candidateId) => controller.switchCandidate(candidateId), [controller]);

  const retry = useCallback(() => {
    setError('');
    const next = controller.start();
    if (next) {
      controller.resolveAndLoad(next).catch(errorValue => {
        reportError(errorValue?.message || '重新加载失败');
      });
    }
    return next;
  }, [controller, reportError]);

  return {
    controller,
    candidate,
    setCandidate,
    status,
    resolvedInput,
    error,
    setError,
    progressRef,
    currentTime: playbackMetrics.currentTime,
    duration: playbackMetrics.duration,
    isPlaying: status === 'playing',
    switchCandidate,
    retry,
    play: () => controller.play(),
    pause: () => controller.pause(),
    seek: seconds => controller.seek(seconds),
    setPlaybackRate: value => controller.setPlaybackRate(value),
  };
}
