import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Heart } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { playbackService } from '../../services/playbackService.js';
import { usePersistentState } from '../../state/usePersistentState.js';

export function MoviePlaybackPage({ request, movies = [], favorites = [], toggleFavorite, onBack, onEpisode, onMovie }) {
  const { recordProgress } = usePersistentState();
  const progressRef = useRef({ currentTime: 0, duration: null, persistedAt: 0 });
  const [source, setSource] = useState(request?.metadata?.sourceId ?? request?.candidates?.[0]?.sourceId ?? '');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [status, setStatus] = useState('idle');
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const movie = movies.find(item => item.contentId === request?.contentId);
  const episodeIndex = Math.max(0, movie?.episodes?.findIndex(item => item.episodeId === request?.episodeId) ?? 0);

  const controller = useMemo(() => playbackService.createController(request, {
    onEvent: event => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
        progressRef.current = { ...progressRef.current, currentTime, duration };
        if (request?.contentId && request?.episodeId && currentTime - progressRef.current.persistedAt >= 15) {
          recordProgress(request.contentId, request.episodeId, currentTime, duration, false);
          progressRef.current.persistedAt = currentTime;
        }
      }
      if (event.event === 'completed' && request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        if (progress.currentTime > 0) persistent.recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, true);
      }
    },
    onStateChange: setStatus,
    onCandidateChange: setCandidate,
    onResolvedInput: setResolvedInput,
    onParserError: ({ code }) => setError('解析失败：' + code),
    onPlayerError: ({ error: playerError }) => setError(playerError?.message || '播放器加载失败'),
    onExhausted: () => setStatus('error'),
  }), [request, recordProgress]);

  useEffect(() => {
    let active = true;
    const player = controller.attachPlayer(videoRef.current);
    const initial = controller.start();
    setCandidate(initial);
    if (!initial) {
      setStatus('error');
      setError('没有可用的播放候选');
    } else {
      controller.resolveAndLoad(initial).catch(errorValue => { if (active) setError(errorValue?.message || '播放初始化失败'); });
    }
    return () => {
      active = false;
      if (request?.contentId && request?.episodeId && progressRef.current.currentTime > 0) {
        const progress = progressRef.current;
        persistent.recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
      }
      controller.leave();
      void player;
    };
  }, [controller, request, recordProgress]);

  const switchCandidate = id => {
    const next = controller.switchCandidate(id);
    if (next) {
      setCandidate(next);
      setSource(next.sourceId ?? '');
      setResolvedInput(null);
      setError('');
    }
  };
  const switchSource = id => {
    setSource(id);
    const next = request?.candidates?.find(item => item.sourceId === id);
    if (next) switchCandidate(next.candidateId);
  };
  const sources = [...new Set((request?.candidates ?? []).map(item => item.sourceId).filter(Boolean))];
  const episodes = movie?.episodes ?? request?.metadata?.episodes ?? [];
  const prev = episodeIndex > 0 ? episodeIndex - 1 : null;
  const next = episodeIndex < episodes.length - 1 ? episodeIndex + 1 : null;
  const favorite = movie ? favorites.some(item => item.targetType === 'content' && item.targetId === movie.contentId) : false;

  return <div className="player-page">
    <button className="back player-back" onClick={onBack}><ChevronLeft />退出播放</button>
    <div className="video-wrap">
      <video ref={videoRef} controls playsInline poster={request?.metadata?.poster} />
      {!resolvedInput && candidate && status !== 'error' && <div className="video-overlay">正在解析播放地址…</div>}
      {status === 'error' && <div className="video-error"><b>播放失败</b><span>{error || '当前播放链路没有可用候选。'}</span><button className="secondary" onClick={() => { setError(''); const nextCandidate = controller.start(); if (nextCandidate) controller.resolveAndLoad(nextCandidate).catch(errorValue => setError(errorValue?.message || '重新加载失败')); }}>重新播放</button><button className="secondary" onClick={onBack}>切换源</button></div>}
    </div>
    <div className="player-info">
      <span className="eyebrow">VOD · Playback Core</span>
      <h2>{request?.metadata?.title ?? '播放'}</h2>
      <p>{request?.metadata?.episodeTitle ?? ''} · 状态：{status}</p>
      <div className="player-episode-switch">
        <button className="secondary" disabled={prev === null} onClick={() => onEpisode?.(movie, prev, source)}>上一集</button>
        <button className="secondary" disabled={next === null} onClick={() => onEpisode?.(movie, next, source)}>下一集</button>
        {movie && <button className={favorite ? 'secondary active-fav' : 'secondary'} onClick={() => toggleFavorite?.('content', movie.contentId)}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏'}</button>}
      </div>
      <SectionTitle title="剧集" /><div className="chips">{episodes.map((episode, index) => <button key={episode.episodeId} className={episode.episodeId === request?.episodeId ? 'active' : ''} onClick={() => onEpisode?.(movie, index, source)}>{episode.title}</button>)}</div>
      <SectionTitle title="来源" /><div className="chips">{sources.map(id => <button key={id} className={source === id ? 'active' : ''} onClick={() => switchSource(id)}>{id}</button>)}</div>
      <SectionTitle title="线路" /><div className="chips">{request?.candidates?.map(item => <button key={item.candidateId} className={candidate?.candidateId === item.candidateId ? 'active' : ''} onClick={() => switchCandidate(item.candidateId)}>{item.metadata?.label ?? item.label ?? item.protocol}</button>)}</div>
      {movie?.description && <><SectionTitle title="简介" /><p>{movie.description}</p></>}
      <SectionTitle title="相关推荐" /><MovieGrid movies={movieService.getRelated({ movies, movie })} onMovie={onMovie} />
    </div>
  </div>;
}

const SectionTitle = ({ title }) => <div className="section-title"><h3>{title}</h3></div>;
const MovieGrid = React.memo(function MovieGrid({ movies, onMovie }) { return <div className="movie-grid">{movies.map(movie => <article className="movie-card" key={movie.contentId} onClick={() => onMovie(movie)}><img src={movie.poster} alt={movie.title} loading="lazy" decoding="async" /><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>; });