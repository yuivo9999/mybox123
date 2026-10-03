import React, { useEffect, useMemo, useRef, useState } from 'react';
import { movieService } from '../../services/movieService.js';
import { playbackService } from '../../services/playbackService.js';
import { usePersistentState } from '../../state/usePersistentState.js';
import { SangtianTopBar } from '../../components/theme/SangtianTopBar.jsx';
import { SangtianDrawer } from '../../components/theme/SangtianDrawer.jsx';
import {
  SangtianPlayerWindow,
  SangtianFloatingBar,
  SangtianConsoleCard
} from '../../components/theme/SangtianPlayerConsole.jsx';

export function MoviePlaybackPage({
  request,
  movies = [],
  favorites = [],
  toggleFavorite,
  onBack,
  onEpisode,
  onMovie,
  onTab,
}) {
  const { recordProgress, saveSettings, settings } = usePersistentState();
  const progressRef = useRef({ currentTime: 0, duration: null, persistedAt: 0 });
  const [source, setSource] = useState(request?.metadata?.sourceId ?? request?.candidates?.[0]?.sourceId ?? '');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [status, setStatus] = useState('idle');
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const videoRef = useRef(null);\n  const videoContainerRef = useRef(null);

  const movie = movies.find(item => item.contentId === request?.contentId);
  const episodes = movie?.episodes ?? request?.metadata?.episodes ?? [];
  const episodeIndex = Math.max(0, episodes.findIndex(item => item.episodeId === request?.episodeId) ?? 0);
  const currentEpisode = episodes[episodeIndex] ?? null;

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
        if (progress.currentTime > 0) {
          recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, true);
        }
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
      controller.resolveAndLoad(initial).catch(errorValue => {
        if (active) setError(errorValue?.message || '播放初始化失败');
      });
    }
    return () => {
      active = false;
      if (request?.contentId && request?.episodeId && progressRef.current.currentTime > 0) {
        const progress = progressRef.current;
        recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
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

  const handleChangePlaybackRate = rate => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleRetry = () => {
    setError('');
    const nextCandidate = controller.start();
    if (nextCandidate) {
      controller.resolveAndLoad(nextCandidate).catch(errorValue => {
        setError(errorValue?.message || '重新加载失败');
      });
    }
  };

  const sources = [...new Set((request?.candidates ?? []).map(item => item.sourceId).filter(Boolean))];
  const candidates = request?.candidates ?? [];
  const relatedMovies = movie ? movieService.getRelated({ movies, movie }) : [];
  const activeStreamUrl = resolvedInput?.url || candidate?.url || candidate?.metadata?.url || '';

  const handleSelectTheme = newTheme => {
    saveSettings({ ...settings, theme: newTheme });
  };

  const candidateLabel = candidate?.metadata?.label || candidate?.label || source || '蓝光4K · 线路1';

  return (
    <div className="player-page theme-sangtian-layout">
      {/* 1. Top Bar matching the image */}
      <SangtianTopBar
        onHamburger={() => setDrawerOpen(true)}
        onPreview={() => {
          // Quick switch to alternate candidate
          const next = candidates.find(c => c.candidateId !== candidate?.candidateId);
          if (next) switchCandidate(next.candidateId);
        }}
        previewText="预览区"
        workspaceText={`工作区 ${episodeIndex + 1}`}
        badgeRed={`${candidates.length || 8}`}
        badgeYellow="9改"
        onWorkspace={() => setSourceModalOpen(true)}
        currentTheme={settings?.theme || 'sangtian'}
        onSelectTheme={handleSelectTheme}
        onCopyLink={() => {
          if (activeStreamUrl && navigator?.clipboard) {
            navigator.clipboard.writeText(activeStreamUrl).catch(() => {});
          }
        }}
        onReload={handleRetry}
        onOpenSettings={() => onTab?.('settings') || onBack()}
      />

      {/* Hamburger Navigation Drawer */}
      <SangtianDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNav={tabKey => {
          setDrawerOpen(false);
          if (tabKey === 'movies' || tabKey === 'home') onBack();
          else onTab?.(tabKey) || onBack();
        }}
        currentTheme={settings?.theme || 'sangtian'}
        onSelectTheme={handleSelectTheme}
      />

      {/* 2. Video Playback Window matching the top window in image */}
      <SangtianPlayerWindow
        videoRef={videoRef}
        status={status}
        error={error}
        resolvedInput={resolvedInput}
        candidate={candidate}
        request={request}
        onRetry={handleRetry}
        onSwitchCandidate={() => {
          const next = candidates.find(c => c.candidateId !== candidate?.candidateId);
          if (next) switchCandidate(next.candidateId);
        }}
        playbackRate={playbackRate}
        onChangePlaybackRate={handleChangePlaybackRate}
        videoContainerRef={videoContainerRef}
        terminalTag="BASH"
      >
        <video
          ref={videoRef}
          controls
          playsInline
          poster={request?.metadata?.poster || movie?.poster}
          className="sangtian-video-element"
        />
      </SangtianPlayerWindow>

      {/* 3. Floating Bar below video window */}
      <SangtianFloatingBar
        playbackRate={playbackRate}
        onChangeRate={handleChangePlaybackRate}
        currentCandidateLabel={`✦ ${candidateLabel}`}
        onOpenSourceModal={() => setSourceModalOpen(true)}
      />

      {/* 4. Bottom Console Card borrowing 50% elements from image */}
      <SangtianConsoleCard
        title={request?.metadata?.title || movie?.title || '精彩视频'}
        subtitle={`${movie?.year || '2026'} · ${movie?.category || '高清影音'} · 第 ${episodeIndex + 1} 集`}
        description={movie?.description}
        episodes={episodes}
        currentEpisodeId={request?.episodeId}
        onSelectEpisode={idx => onEpisode?.(movie, idx, source, request?.metadata?.returnRoute || 'detail')}
        sources={sources}
        currentSource={source}
        onSelectSource={switchSource}
        candidates={candidates}
        currentCandidateId={candidate?.candidateId}
        onSelectCandidate={switchCandidate}
        streamUrl={activeStreamUrl}
        relatedItems={relatedMovies}
        onSelectRelated={onMovie}
        onReplay={handleRetry}
        onTogglePip={() => {
          if (videoRef.current && document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture?.().catch(() => {});
            } else {
              videoRef.current.requestPictureInPicture?.().catch(() => {});
            }
          }
        }}
      />

      {/* Source Selection Modal if requested */}
      {sourceModalOpen && (
        <div className="sangtian-modal-backdrop" onClick={() => setSourceModalOpen(false)}>
          <div className="sangtian-modal" onClick={e => e.stopPropagation()}>
            <h4>选择工作区与线路</h4>
            <div className="sangtian-modal-section">
              <span>可用来源：</span>
              <div className="chips">
                {sources.map(s => (
                  <button
                    key={s}
                    className={source === s ? 'active' : ''}
                    onClick={() => { switchSource(s); setSourceModalOpen(false); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="sangtian-modal-section">
              <span>可用线路候选：</span>
              <div className="chips">
                {candidates.map(c => (
                  <button
                    key={c.candidateId}
                    className={candidate?.candidateId === c.candidateId ? 'active' : ''}
                    onClick={() => { switchCandidate(c.candidateId); setSourceModalOpen(false); }}
                  >
                    {c.metadata?.label || c.label || c.protocol}
                  </button>
                ))}
              </div>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => setSourceModalOpen(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
