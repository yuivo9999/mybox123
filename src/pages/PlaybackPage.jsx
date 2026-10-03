import React, { useEffect, useMemo, useRef, useState } from 'react';
import { playbackService } from '../services/playbackService';
import { SangtianTopBar } from '../components/theme/SangtianTopBar.jsx';
import { SangtianDrawer } from '../components/theme/SangtianDrawer.jsx';
import {
  SangtianPlayerWindow,
  SangtianFloatingBar,
  SangtianConsoleCard
} from '../components/theme/SangtianPlayerConsole.jsx';

function PlaybackView({
  request,
  kind,
  onBack,
  channels = [],
  favorites = [],
  onChannel,
  onPlay,
  toggleFavorite,
  onTab,
}) {
  const [status, setStatus] = useState('idle');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const videoRef = useRef(null);
  const playerWindowBodyRef = useRef(null);

  const controller = useMemo(() => playbackService.createController(request, {
    onEvent: e => {
      if (e.event === 'error') setError(e.error || '播放候选失败');
      if (e.event === 'released') setStatus('released');
      if (e.event === 'stopped') setStatus('stopped');
    },
    onStateChange: setStatus,
    onCandidateChange: next => {
      setCandidate(next);
      setResolvedInput(null);
      if (next) setError('');
    },
    onResolvedInput: setResolvedInput,
    onParserError: ({ code }) => setError('解析失败：' + code),
    onPlayerError: ({ error: e }) => setError(e?.message || '播放器加载失败'),
    onExhausted: () => setStatus('error'),
  }), [request]);

  useEffect(() => {
    const onVisibility = () => void controller.handleAppState(document.visibilityState === 'hidden' ? 'background' : 'foreground');
    document.addEventListener('visibilitychange', onVisibility);
    const player = controller.attachPlayer(videoRef.current);
    const initial = controller.start();
    setCandidate(initial);
    if (!initial) {
      setStatus('error');
      setError('没有可用的播放候选');
    } else {
      controller.resolveAndLoad(initial).catch(e => setError(e?.message || '播放初始化失败'));
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.leave();
      void player;
    };
  }, [controller]);

  useEffect(() => {
    const body = playerWindowBodyRef.current;
    if (!body || !controller?.setVideoViewBounds) return undefined;

    const syncNativeVideoSurface = () => {
      if (typeof window === 'undefined' || typeof body.getBoundingClientRect !== 'function') return;
      const rect = body.getBoundingClientRect();
      controller.setVideoViewBounds({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };

    syncNativeVideoSurface();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncNativeVideoSurface)
      : null;
    observer?.observe(body);
    window.addEventListener('resize', syncNativeVideoSurface);
    window.addEventListener('orientationchange', syncNativeVideoSurface);
    const timer = window.setTimeout(syncNativeVideoSurface, 150);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncNativeVideoSurface);
      window.removeEventListener('orientationchange', syncNativeVideoSurface);
      window.clearTimeout(timer);
    };
  }, [controller]);

  const channel = channels.find(c => c.channelId === request?.channelId);
  const now = Date.now();
  const currentProgram = channel?.epg?.find(program => program.status === 'live' || (Date.parse(program.startAt) <= now && now < Date.parse(program.endAt)));
  const nextProgram = channel?.epg?.find(program => program.status === 'upcoming' || Date.parse(program.startAt) > now);

  const switchCandidate = id => {
    const next = controller.switchCandidate(id);
    if (next) {
      setCandidate(next);
      setResolvedInput(null);
    }
  };

  const switchChannel = next => {
    if (next) onPlay?.(next);
  };

  const handleRetry = () => {
    setError('');
    const retry = controller.start();
    if (retry) {
      controller.resolveAndLoad(retry).catch(e => setError(e?.message || '重新加载失败'));
    }
  };

  const handleChangePlaybackRate = rate => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const candidates = request?.candidates ?? [];
  const relatedChannels = channels.filter(c => c.channelId !== channel?.channelId);
  const activeStreamUrl = resolvedInput?.url || candidate?.url || candidate?.metadata?.url || '';

  const candidateLabel = candidate?.metadata?.label || candidate?.label || '蓝光4K · 线路1';

  return (
    <div className="player-page theme-sangtian-layout">
      {/* 1. Top Bar matching the image */}
      <SangtianTopBar
        onHamburger={() => setDrawerOpen(true)}
        onPreview={() => {
          const next = candidates.find(item => item.candidateId !== candidate?.candidateId && !controller.failedCandidateIds?.includes(item.candidateId));
          if (next) switchCandidate(next.candidateId);
        }}
        previewText="预览区"
        workspaceText="工作区 5"
        badgeRed={`${candidates.length || 8}`}
        badgeYellow="9改"
        onWorkspace={() => setSourceModalOpen(true)}
        currentTheme="sangtian"
        onCopyLink={() => {
          if (activeStreamUrl && navigator?.clipboard) {
            navigator.clipboard.writeText(activeStreamUrl).catch(() => {});
          }
        }}
        onReload={handleRetry}
        onOpenSettings={() => onBack()}
      />

      {/* Hamburger Navigation Drawer */}
      <SangtianDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNav={tabKey => {
          setDrawerOpen(false);
          onBack();
        }}
        currentTheme="sangtian"
      />

      {/* 2. Video Playback Window matching the top window in image */}
      <SangtianPlayerWindow
        videoRef={videoRef}
        videoContainerRef={playerWindowBodyRef}
        status={status}
        error={error}
        resolvedInput={resolvedInput}
        candidate={candidate}
        request={request}
        onRetry={handleRetry}
        onSwitchCandidate={() => {
          const next = candidates.find(item => item.candidateId !== candidate?.candidateId && !controller.failedCandidateIds?.includes(item.candidateId));
          if (next) switchCandidate(next.candidateId);
        }}
        terminalTag="BASH"
      >
        <video ref={videoRef} controls playsInline className="sangtian-video-element" />
        {status === 'error' && (
          <div className="video-error" style={{ display: 'none' }}>
            <span>{error}</span>
            <button onClick={handleRetry}>重新播放</button>
            <button onClick={() => {
              const next = candidates.find(item => item.candidateId !== candidate?.candidateId);
              if (next) switchCandidate(next.candidateId);
            }}>切换线路</button>
          </div>
        )}
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
        title={request?.metadata?.title ?? channel?.name ?? 'LIVE 直播'}
        subtitle={`● 正在直播 · ${request?.metadata?.category ?? channel?.category ?? '通用频道'} · 状态：${status === 'idle' || status === 'loading' ? '连接中' : status === 'error' ? '播放失败' : '直播中'}`}
        description={
          currentProgram
            ? `当前节目：${currentProgram.title || '未命名节目'} (${currentProgram.startAt || '—'}–${currentProgram.endAt || '—'})${nextProgram ? ` | 下一节目：${nextProgram.title || '—'}` : ''}`
            : '本直播源已接入“桑田山河”高品质流分发矩阵，支持毫秒级候选重试与低延迟播放。'
        }
        episodes={channel?.streams?.map(s => ({ episodeId: s.streamId, title: s.label || s.protocol })) || []}
        currentEpisodeId={candidate?.candidateId}
        onSelectEpisode={idx => {
          const s = channel?.streams?.[idx];
          if (s) switchCandidate(s.streamId);
        }}
        candidates={candidates}
        currentCandidateId={candidate?.candidateId}
        onSelectCandidate={switchCandidate}
        streamUrl={activeStreamUrl}
        relatedItems={relatedChannels}
        onSelectRelated={switchChannel}
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
            <h4>选择直播线路</h4>
            <div className="chips">
              {candidates.map(item => (
                <button
                  key={item.candidateId}
                  className={candidate?.candidateId === item.candidateId ? 'active' : ''}
                  onClick={() => { switchCandidate(item.candidateId); setSourceModalOpen(false); }}
                >
                  {item.metadata?.label ?? item.label ?? item.protocol}
                </button>
              ))}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => setSourceModalOpen(false)}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlaybackPage(props) {
  return <PlaybackView {...props} />;
}
