import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playbackService } from '../services/playbackService.js';

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
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [status, setStatus] = useState('idle');
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');

  const reportError = useCallback((message) => {
    setError(message || '');
  }, []);

  const controller = useMemo(() => playbackService.createController(request, {
    onEvent: event => {
      onEventRef.current?.(event);
      if (event.event === 'error') {
        reportError(event.error || '播放候选失败');
      }
      if (!isLive && event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
        progressRef.current = { ...progressRef.current, currentTime, duration };
        if (
          request?.contentId &&
          request?.episodeId &&
          typeof recordProgress === 'function' &&
          currentTime - progressRef.current.persistedAt >= 15
        ) {
          recordProgress(request.contentId, request.episodeId, currentTime, duration, false);
          progressRef.current.persistedAt = currentTime;
        }
      }
      if (!isLive && event.event === 'completed' && request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        if (progress.currentTime > 0 && typeof recordProgress === 'function') {
          recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, true);
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
  }), [request, isLive, recordProgress, reportError]);

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
      if (!isLive && request?.contentId && request?.episodeId && progressRef.current.currentTime > 0 && typeof recordProgress === 'function') {
        const progress = progressRef.current;
        recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
      }
      controller.leave();
      void player;
    };
  }, [controller, request, videoRef, isLive, recordProgress, reportError]);

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
  };
}
