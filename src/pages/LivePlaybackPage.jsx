import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Radio } from 'lucide-react';
import { usePlaybackController } from '../playback/usePlaybackController.js';
import { usePersistentState } from '../state/usePersistentState.js';
import { SangtianTopBar } from '../components/theme/SangtianTopBar.jsx';
import { SangtianDrawer } from '../components/theme/SangtianDrawer.jsx';
import {
  SangtianPlayerWindow,
  SangtianConsoleCard,
} from '../components/theme/SangtianPlayerConsole.jsx';

function PlaybackView({
  request,
  onBack,
  channels = [],
  favorites = [],
  onChannel,
  onPlay,
  toggleFavorite,
}) {
  const { recordProgress, saveSettings, settings } = usePersistentState();
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const videoRef = useRef(null);
  const playerWindowBodyRef = useRef(null);

  const channel = useMemo(
    () => channels.find(item => item.channelId === request?.channelId) ?? null,
    [channels, request],
  );

  const now = Date.now();
  const currentProgram = useMemo(() => {
    if (!channel) return null;
    return channel.epg?.find(program => (
      program.controllerStatus === 'live'
      || (Date.parse(program.startAt) <= now && now < Date.parse(program.endAt))
    )) ?? null;
  }, [channel, now]);

  const nextProgram = useMemo(() => {
    if (!channel) return null;
    return channel.epg?.find(program => (
      program.controllerStatus === 'upcoming' || Date.parse(program.startAt) > now
    )) ?? null;
  }, [channel, now]);

  const {
    controller,
    activeCandidate: activeCandidate,
    controllerStatus: controllerStatus,
    resolvedInput: controllerResolvedInput,
    error: controllerError,
    switchCandidate: switchCandidateFromController,
    retry: handleRetry,
    setPlaybackRate: setControllerPlaybackRate,
  } = usePlaybackController({
    request,
    videoRef,
    recordProgress,
    isLive: true,
  });


  useEffect(() => {
    if (!controller || !playerWindowBodyRef.current?.getBoundingClientRect) return undefined;

    const syncNativeVideoSurface = () => {
      if (typeof window === 'undefined') return;
      const rect = playerWindowBodyRef.current.getBoundingClientRect();
      controller.setVideoViewBounds?.({
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
    observer?.observe(playerWindowBodyRef.current);
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

  const switchCandidate = candidateId => switchCandidateFromController(candidateId);

  const handleStop = () => {
    try {
      controller?.stop();
    } catch (stopError) {
      console.error('Stop controller failed:', stopError);
    }
  };

  const handleChangePlaybackRate = rate => {
    setPlaybackRate(rate);
    setControllerPlaybackRate(rate);
  };

  const handleSelectTheme = newTheme => {
    saveSettings({ ...settings, theme: newTheme });
  };

  const candidates = request?.candidates ?? [];
  const activeStreamUrl = controllerResolvedInput?.url
    || activeCandidate?.mediaUrl
    || activeCandidate?.url
    || activeCandidate?.metadata?.url
    || '';
  const candidateLabel = activeCandidate?.metadata?.label
    || activeCandidate?.label
    || (activeCandidate?.index != null ? `线路 ${activeCandidate.index + 1}` : null)
    || '线路 1';

  const parsedChannelInfo = useMemo(() => {
    const rawName = request?.metadata?.title ?? channel?.name ?? 'LIVE 直播';
    const digitMatch = rawName.match(/\d+/);
    if (!digitMatch) return { cleanName: rawName, number: null };
    const number = digitMatch[0];
    const cleanName = rawName.replace(new RegExp(`-?\\s*${number}`), '').trim();
    return { cleanName, number };
  }, [request, channel]);

  const isFavorited = useMemo(
    () => favorites.some(item => item.targetType === 'channel' && item.targetId === request?.channelId),
    [favorites, request],
  );

  return (
    <div className="player-page theme-sangtian-layout">
      <SangtianTopBar
        onHamburger={() => setDrawerOpen(true)}
        previewText="切换线路"
        workspaceText={parsedChannelInfo.cleanName}
        badgeRed={parsedChannelInfo.number}
        badgeYellow={isFavorited ? '已收藏' : '收藏'}
        yellowHeart
        isYellowActive={isFavorited}
        onYellowClick={() => {
          if (request?.channelId) toggleFavorite?.('channel', request.channelId);
        }}
        onWorkspace={() => setSourceModalOpen(true)}
        currentTheme={settings?.theme || 'sangtian'}
        onSelectTheme={handleSelectTheme}
        onCopyLink={() => {
          if (activeStreamUrl && navigator?.clipboard) {
            navigator.clipboard.writeText(activeStreamUrl).catch(() => {});
          }
        }}
        onReload={handleRetry}
        onOpenSettings={onBack}
      />

      <SangtianDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNav={() => {
          setDrawerOpen(false);
          onBack();
        }}
        currentTheme={settings?.theme || 'sangtian'}
        onSelectTheme={handleSelectTheme}
      />

      <SangtianPlayerWindow
        videoRef={videoRef}
        videoContainerRef={playerWindowBodyRef}
        controllerStatus={controllerStatus}
        error={error}
        resolvedInput={resolvedInput}
        activeCandidate={activeCandidate}
        request={request}
        onRetry={handleRetry}
        onStop={handleStop}
        onSwitchCandidate={() => {
          const next = candidates.find(item => item.candidateId !== activeCandidate?.candidateId);
          if (next) switchCandidate(next.candidateId);
        }}
        terminalTag="LIVE DIRECT"
        isLive
        playbackRate={playbackRate}
        onChangePlaybackRate={handleChangePlaybackRate}
        onTogglePlayback={() => {
          if (controllerStatus === 'playing') controller?.pause?.();
          else controller?.play?.();
        }}
        channels={channels}
        activeChannel={channel}
        activeStreamIndex={request?.candidates?.findIndex(item => item.candidateId === activeCandidate?.candidateId) ?? 0}
        onSelectChannel={onChannel}
        onSwitchStreamIndex={index => {
          const next = candidates[index];
          if (next) switchCandidate(next.candidateId);
        }}
        title={request?.metadata?.title ?? channel?.name ?? 'LIVE 直播'}
        sourceLabel={candidateLabel}
        candidates={candidates}
        onSelectCandidate={switchCandidate}
        onOpenSourceModal={() => setSourceModalOpen(true)}
      >
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          poster={request?.metadata?.poster || channel?.logo}
          className="sangtian-video-element"
        />
      </SangtianPlayerWindow>

      <SangtianConsoleCard
        title={request?.metadata?.title ?? channel?.name ?? 'LIVE 直播'}
        subtitle={`● 正在直播 · ${request?.metadata?.category ?? channel?.category ?? '通用频道'}`}
        description={currentProgram
          ? `当前节目：${currentProgram.title || '未命名'} (${currentProgram.startAt || ''}–${currentProgram.endAt || ''})${nextProgram ? ` | 下一节目：${nextProgram.title || ''}` : ''}`
          : '暂无节目单信息。'}
        episodes={[]}
        currentEpisodeId={null}
        candidates={candidates}
        currentCandidateId={activeCandidate?.candidateId}
        onSelectCandidate={switchCandidate}
        streamUrl={activeStreamUrl}
        relatedItems={channels}
        activeItemId={request?.channelId}
        onSelectRelated={next => {
          if (next) onPlay?.(next);
        }}
        onReplay={handleRetry}
        playerStatus={controllerStatus}
        isLive
        onBack={onBack}
        onFav={() => {
          if (request?.channelId) toggleFavorite?.('channel', request.channelId);
        }}
        isFav={isFavorited}
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

      {sourceModalOpen && (
        <div className="sangtian-modal-backdrop" onClick={() => setSourceModalOpen(false)}>
          <div className="sangtian-modal" onClick={event => event.stopPropagation()}>
            <h4>选择直播线路</h4>
            <div>
              <h5>线路 / 播放源</h5>
              <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {candidates.map((item, index) => (
                  <button
                    key={item.candidateId}
                    className={activeCandidate?.candidateId === item.candidateId ? 'active' : ''}
                    onClick={() => {
                      switchCandidate(item.candidateId);
                      setSourceModalOpen(false);
                    }}
                  >
                    {item.metadata?.label || item.label || (item.index != null ? `线路 ${item.index + 1}` : `线路 ${index + 1}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="actions" style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => setSourceModalOpen(false)}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LivePlaybackPage(props) {
  return <PlaybackView {...props} />;
}
