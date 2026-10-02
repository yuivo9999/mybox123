import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { playbackService } from '../services/playbackService';
import { createPlaybackCore } from '../playback/playbackCore';
import { usePersistentState } from '../state/usePersistentState.js';

function PlaybackView({ request, kind, onBack }) {
  const persistent = usePersistentState();
  const progressRef = React.useRef({ currentTime: 0, duration: null, persistedAt: 0 });
  const [status, setStatus] = useState('idle');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const videoRef = React.useRef(null);
  const task = useMemo(() => playbackService.createTask(request), [request]);

  const core = useMemo(() => createPlaybackCore(task, {
    onEvent: (event) => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
        progressRef.current = { ...progressRef.current, currentTime, duration };
        if (kind === 'vod' && request?.contentId && request?.episodeId && currentTime > 0 && currentTime - progressRef.current.persistedAt >= 15) {
          persistent.recordProgress(request.contentId, request.episodeId, currentTime, duration, false);
          progressRef.current.persistedAt = currentTime;
        }
      }
      if (event.event === 'completed' && kind === 'vod' && request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        persistent.recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, true);
      }
      if (event.event === 'released') setStatus('released');
      if (event.event === 'stopped') setStatus('stopped');
    },
    onStateChange: setStatus,
    onCandidateChange: (next) => { setCandidate(next); setResolvedInput(null); if (next) setError(''); },
    onResolvedInput: setResolvedInput,
    onParserError: ({ code }) => { setResolvedInput(null); setError(`解析失败：${code}`); },
    onPlayerError: ({ error: playerError }) => setError(playerError?.message || '播放器加载失败'),
    onExhausted: () => setStatus('error'),
  }), [task]);

  useEffect(() => {
    const player = core.attachPlayer(videoRef.current);
    const initial = core.start();
    setCandidate(initial);
    if (!initial) {
      setStatus('error');
      setError('没有可用的播放候选');
    } else {
      core.resolveAndLoad(initial).catch((loadError) => setError(loadError?.message || '播放初始化失败'));
    }
    return () => {
      if (kind === 'vod' && request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        if (progress.currentTime > 0) persistent.recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
      }
      core.stop();
      core.release();
      void player;
    };
  }, [core, kind, request, persistent.recordProgress]);

  const switchCandidate = (candidateId) => {
    const next = core.switchCandidate(candidateId);
    if (next) {
      setCandidate(next);
      setResolvedInput(null);
      setStatus('loading');
      core.resolveAndLoad(next).catch((loadError) => setError(loadError?.message || '切换线路失败'));
    }
  };

  return (
    <div className="player-page">
      <button className="back player-back" onClick={onBack}><ChevronLeft />退出{kind === 'live' ? '直播' : '播放'}</button>
      <div className="video-wrap">
        <video ref={videoRef} controls playsInline poster={request?.metadata?.poster} />
        {!resolvedInput && candidate && status !== 'error' && <div className="video-overlay">正在解析播放地址…</div>}
        {status === 'error' && <div className="video-error">{error || '当前播放链路没有可用候选。'}</div>}
      </div>
      <div className="player-info">
        <span className="eyebrow">{kind === 'live' ? 'LIVE' : 'VOD'} · Playback Core</span>
        <h2>{request?.metadata?.title ?? '播放'}</h2>
        <p>{request?.metadata?.category ?? ''} · {request?.candidates?.length ?? 0} 条候选 · 状态：{status}</p>
        <div className="chips">{request?.candidates?.map((item) => <button key={item.candidateId} className={candidate?.candidateId === item.candidateId ? 'active' : ''} onClick={() => switchCandidate(item.candidateId)}>{item.metadata?.label ?? item.label ?? item.protocol}</button>)}</div>
        <small>候选身份：{candidate?.candidateId ?? '—'} · 来源：{candidate?.sourceId ?? '—'} · 解析结果：{resolvedInput?.protocol ?? '等待'}</small>
      </div>
    </div>
  );
}

function LivePlayer({ request, onBack }) {
  return <PlaybackView request={request} kind="live" onBack={onBack} />;
}

export function PlaybackPage({ request, kind, onBack }) {
  return <PlaybackView request={request} kind={kind} onBack={onBack} />;
}