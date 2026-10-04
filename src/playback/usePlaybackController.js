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
  const progressRef = useRef({ currentTime: 0, duration: null, persistedAt: 0 });
  const onEventRef = useRef(onEvent);
  const recordProgressRef = useRef(recordProgress);
  const requestRef = useRef(request);
  const requestKeyRef = useRef(getPlaybackRequestKey(request));
  const requestKey = getPlaybackRequestKey(request);

  if (requestKeyRef.current !== requestKey) {
    requestKeyRef.current = requestKey;
    requestRef.current = request;
    progressRef.current = { currentTime: 0, duration: null, persistedAt: 0 };
  }

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

  const reportError = useCallback((message) => {
    setError(message || '');
  }, []);

  const controller = useMemo(() => playbackService.createController(requestRef.current, {
    onEvent: event => {
      onEventRef.current?.(event);
      const currentRequest = requestRef.current;
      if (event.event === 'error') {
        reportError(event.error || '播放候选失败');
      }
      if (!isLive && event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
        progressRef.current = { ...progressRef.current, currentTime, duration };
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
    onStateChange: setStatus,
    onCandidateChange: next => {
      setCandidate(next);
      setResolvedInput(null);
      if (next) setError('');
    },
    onResolvedInput: setResolvedInput,
    onParserError: ({ code }) => reportError('解析失败：' + code),
    onPlayerError: ({ error: playerError }) => reportError(playerError?.message || '播放器加载失败'),
    onExhausted: () => setStatus('error'),
  }), [requestKey, isLive, reportError]);

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
        if (active) reportError(errorValue?.message || '播放初始化失败');
      });
    }

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      const currentRequest = requestRef.current;
      if (
        !isLive
        && currentRequest?.contentId
        && currentRequest?.episodeId
        && progressRef.current.currentTime > 0
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

  const switchCandidate = useCallback((candidateId) => {
    const next = controller.switchCandidate(candidateId);
    if (next) {
      setCandidate(next);
      setResolvedInput(null);
      setError('');
    }
    return next;
  }, [controller]);

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
    switchCandidate,
    retry,
    play: () => controller.play(),
    pause: () => controller.pause(),
    seek: seconds => controller.seek(seconds),
    setPlaybackRate: value => controller.setPlaybackRate(value),
  };
}
