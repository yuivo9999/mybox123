import React, { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { ChevronLeft, Heart, Play, Radio } from 'lucide-react';
import { liveService } from '../../services/liveService.js';
import { playbackService } from '../../services/playbackService.js';
import { requestManager } from '../../services/requestManager.js';
import { tv1LiveService } from '../../services/tv1LiveService.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState, LoadingState } from '../../components/StateViews.jsx';
import { SangtianPlayerWindow } from '../../components/theme/SangtianPlayerConsole.jsx';

export function createLiveFeature({ channels = [] } = {}) {
  return {
    getCategories() { return liveService.getCategories(channels); },
    list(options = {}) { return liveService.listChannels(channels, options); },
    getChannel(id) { return liveService.getById(channels, id); },
    async getEPG(channel, range) { return liveService.getEPG(channel, range); },
  };
}

export function LiveFeature({ channels = [], sources = [], favorites = [], onChannel, onPlay, onTab, toggleFavorite }) {
  const page = usePageState();
  const videoRef = useRef(null);
  const playerWindowBodyRef = useRef(null);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);
  const [tv1Channels, setTv1Channels] = useState([]);
  const [tv1Loading, setTv1Loading] = useState(false);
  const [tv1LoadedCount, setTv1LoadedCount] = useState(0);
  const [tv1Error, setTv1Error] = useState(null);
  const [resolvedStreams, setResolvedStreams] = useState({});
  const [streamLoading, setStreamLoading] = useState(false);

  const enabledTv1Sources = useMemo(
    () => sources.filter(source => source.sourceType === 'live' && source.liveMode === 'tv1' && source.enabled !== false),
    [sources],
  );

  useEffect(() => {
    let active = true;
    setTv1Channels([]);
    setTv1LoadedCount(0);
    setTv1Error(null);
    if (!enabledTv1Sources.length) {
      setTv1Loading(false);
      return () => { active = false; };
    }

    setTv1Loading(true);
    const loadSource = async source => {
      try {
        await tv1LiveService.loadMetadata(source, {
          onChannel: channel => {
            if (!active) return;
            startTransition(() => {
              setTv1Channels(prev => [...prev, channel]);
              setTv1LoadedCount(count => count + 1);
            });
          },
        });
      } catch (error) {
        if (active && error?.name !== 'AbortError') setTv1Error(error);
      }
    };

    void Promise.all(enabledTv1Sources.map(loadSource)).finally(() => {
      if (active) setTv1Loading(false);
    });

    return () => {
      active = false;
      enabledTv1Sources.forEach(source => tv1LiveService.clear(source.sourceId));
    };
  }, [enabledTv1Sources]);

  const allChannels = useMemo(() => [...channels, ...tv1Channels], [channels, tv1Channels]);

  // 源启停/删除后，立即丢弃已经失效的频道选择与延迟流缓存。
  // 不能只依赖页面卸载：Live 页面可能一直挂载，而 sources 会原地变化。
  useEffect(() => {
    const availableIds = new Set(allChannels.map(channel => channel.channelId));
    setResolvedStreams(prev => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([channelId]) => availableIds.has(channelId)),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    if (selectedChannelId && !availableIds.has(selectedChannelId)) {
      setSelectedChannelId('');
      setActiveStreamIndex(0);
    }
  }, [allChannels, selectedChannelId]);
  const activeChannelBase = useMemo(
    () => allChannels.find(channel => channel.channelId === selectedChannelId) || null,
    [allChannels, selectedChannelId],
  );
  const activeChannel = useMemo(() => {
    if (!activeChannelBase) return null;
    const lazyStreams = resolvedStreams[activeChannelBase.channelId];
    return lazyStreams ? { ...activeChannelBase, streams: lazyStreams } : activeChannelBase;
  }, [activeChannelBase, resolvedStreams]);

  const activeStream = activeChannel?.streams?.[activeStreamIndex] || activeChannel?.streams?.[0] || null;
  const livePlaybackRequest = useMemo(() => {
    if (!activeChannel?.streams?.length) return null;
    return playbackService.createLiveRequest({ channel: activeChannel });
  }, [activeChannel]);
  const [playbackCandidate, setPlaybackCandidate] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState('idle');
  const [playbackError, setPlaybackError] = useState('');
  const [resolvedPlaybackInput, setResolvedPlaybackInput] = useState(null);
  const playbackController = useMemo(() => livePlaybackRequest
    ? playbackService.createController(livePlaybackRequest, {
        onStateChange: setPlaybackStatus,
        onCandidateChange: next => {
          setPlaybackCandidate(next);
          if (next) {
            setPlaybackError('');
            const index = livePlaybackRequest.candidates.findIndex(item => item.candidateId === next.candidateId);
            if (index >= 0) setActiveStreamIndex(index);
          }
        },
        onResolvedInput: setResolvedPlaybackInput,
        onPlayerError: ({ error }) => setPlaybackError(error?.message || '播放器加载失败'),
        onParserError: ({ code }) => setPlaybackError('解析失败：' + code),
        onExhausted: () => setPlaybackStatus('error'),
      })
    : null, [livePlaybackRequest]);

  const loadTv1Streams = async channel => {
    const sourceRef = channel?.sourceRefs?.find(ref => enabledTv1Sources.some(source => source.sourceId === ref.sourceId));
    const source = sourceRef ? enabledTv1Sources.find(item => item.sourceId === sourceRef.sourceId) : null;
    if (!source || !channel?.deferredRef) return;
    if (resolvedStreams[channel.channelId]) return;

    setStreamLoading(true);
    setSelectedChannelId(channel.channelId);
    setActiveStreamIndex(0);
    try {
      const streams = await requestManager.run(
        'tv1-streams:' + source.sourceId + ':' + channel.channelId,
        signal => tv1LiveService.getStreams(source, channel, { signal }),
      );
      setResolvedStreams(prev => ({ ...prev, [channel.channelId]: streams }));
    } catch (error) {
      if (error?.name !== 'AbortError') setTv1Error(error);
    } finally {
      setStreamLoading(false);
    }
  };

  const loadDeferredStreams = async channel => {
    if (!channel?.deferredRef || resolvedStreams[channel.channelId]) return;
    setStreamLoading(true);
    try {
      const streams = await requestManager.run(
        'live-deferred-streams:' + channel.channelId,
        signal => liveService.getStreams(channel, { signal }),
      );
      setResolvedStreams(prev => ({ ...prev, [channel.channelId]: streams }));
    } catch (error) {
      if (error?.name !== 'AbortError') setTv1Error(error);
    } finally {
      setStreamLoading(false);
    }
  };

  const selectChannel = channel => {
    setSelectedChannelId(channel.channelId);
    setActiveStreamIndex(0);
    setPlaybackCandidate(null);
    setResolvedPlaybackInput(null);
    setPlaybackError('');
    if (channel.deferredRef) {
      const tv1Source = channel.sourceRefs?.some(ref => enabledTv1Sources.some(source => source.sourceId === ref.sourceId));
      void (tv1Source ? loadTv1Streams(channel) : loadDeferredStreams(channel));
    }
  };

  useEffect(() => {
    const body = playerWindowBodyRef.current;
    if (!body || !playbackController?.setVideoViewBounds) return undefined;

    const syncNativeVideoSurface = () => {
      if (typeof window === 'undefined' || typeof body.getBoundingClientRect !== 'function') return;
      const rect = body.getBoundingClientRect();
      playbackController.setVideoViewBounds({
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
  }, [playbackController]);

  useEffect(() => {
    if (!playbackController) {
      setPlaybackCandidate(null);
      setResolvedPlaybackInput(null);
      setPlaybackStatus('idle');
      setPlaybackError('');
      return undefined;
    }
    const player = playbackController.attachPlayer(videoRef.current);
    const initial = playbackController.start();
    setPlaybackCandidate(initial);
    setResolvedPlaybackInput(null);
    if (initial) {
      playbackController.resolveAndLoad(initial).catch(error => setPlaybackError(error?.message || '播放初始化失败'));
    } else {
      setPlaybackStatus('error');
      setPlaybackError('没有可用的播放候选');
    }
    return () => {
      void player;
      playbackController.leave();
    };
  }, [playbackController]);

  useEffect(() => {
    const top = Number(page.live.scrollTop) || 0;
    requestAnimationFrame(() => window.scrollTo(0, top));
    const save = () => pageStateStore.patch('live', { scrollTop: window.scrollY });
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  const hasEnabledLiveSource = sources.some(source => source.sourceType === 'live' && source.enabled !== false);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const channel of allChannels) {
      const category = channel.category || '未分类';
      if (!map.has(category)) map.set(category, []);
      map.get(category).push(channel);
    }
    return [...map.entries()];
  }, [allChannels]);

  return (
    <Page>
      <Header title="直播" />

      <SangtianPlayerWindow
        videoRef={videoRef}
        videoContainerRef={playerWindowBodyRef}
        status={playbackStatus}
        candidate={activeStream ? {
          label: playbackCandidate?.label || activeStream.label || '默认线路',
          url: playbackCandidate?.mediaUrl || activeStream.url,
          protocol: playbackCandidate?.protocol || activeStream.protocol || 'HLS/M3U8',
          sourceId: playbackCandidate?.sourceId || activeStream.sourceId,
        } : { label: '请选择频道', protocol: 'LIVE' }}
        error={playbackError}
        resolvedInput={resolvedPlaybackInput}
        terminalTag={activeChannel ? 'LIVE · ' + activeChannel.name : 'LIVE · 等待频道'}
      >
        <video ref={videoRef} controls playsInline className="sangtian-video-element" />
      </SangtianPlayerWindow>

      {activeChannel && (
        <div className="live-current-bar">
          <div className="live-current-info">
            <span className="live-pill">● 正在直播</span>
            <b>{activeChannel.name}</b>
            <small>{activeChannel.category} · {activeStream?.label || (streamLoading ? '正在读取地址…' : '等待播放')}</small>
          </div>
          <div className="live-current-actions">
            {activeChannel.streams?.length > 1 && activeChannel.streams.map((stream, index) => (
              <button key={stream.streamId || index} className={activeStreamIndex === index ? 'active' : ''} onClick={() => {
                setActiveStreamIndex(index);
                const candidate = livePlaybackRequest?.candidates?.[index];
                if (candidate && playbackController) playbackController.switchCandidate(candidate.candidateId);
              }}>
                {stream.label || '线路 ' + (index + 1)}
              </button>
            ))}
            <button className="secondary icon-button" onClick={() => toggleFavorite('channel', activeChannel.channelId)}>
              <Heart size={16} fill={favorites.some(i => i.targetType === 'channel' && i.targetId === activeChannel.channelId) ? 'currentColor' : 'none'} />
            </button>
            <button className="primary" onClick={() => onPlay?.(activeChannel, activeStream?.streamId)} disabled={!activeStream}>
              <Play size={13} /> 沉浸播放
            </button>
          </div>
        </div>
      )}

      {hasEnabledLiveSource && (
        <>
          <div className="section-title">
            <h3>频道文件树</h3>
            {tv1Loading && <small>正在读取频道名称：{tv1LoadedCount}</small>}
          </div>

          {tv1Error && <div className="info-card"><Radio size={18}/><div><b>部分 TV1 源读取异常</b><span>{tv1Error.message || '未知错误'}；已保留已读取的频道。</span></div></div>}

          {!allChannels.length && tv1Loading && (
            <LoadingState compact text="正在建立频道文件树，暂不读取频道播放地址…" />
          )}

          {!!allChannels.length && (
            <div className="channel-tree">
          {grouped.map(([category, categoryChannels]) => (
            <details key={category} open>
              <summary style={{ cursor: 'pointer', padding: '9px 6px', fontWeight: 700 }}>
                <Radio size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {category}
                <small style={{ marginLeft: 8, opacity: 0.65 }}>{categoryChannels.length}</small>
              </summary>
              <div className="channel-list" style={{ paddingLeft: 12 }}>
                {categoryChannels.map(channel => {
                  const isCurrent = channel.channelId === activeChannel?.channelId;
                  const favorite = favorites.some(i => i.targetType === 'channel' && i.targetId === channel.channelId);
                  const isLazy = Boolean(channel.deferredRef);
                  const isResolving = streamLoading && selectedChannelId === channel.channelId && isLazy;
                  const streamCount = resolvedStreams[channel.channelId]?.length ?? channel.streams?.length ?? 0;
                  return (
                    <div className={'channel ' + (isCurrent ? 'active-playing' : '')} key={channel.channelId} onClick={() => selectChannel(channel)}>
                      <div className="channel-logo"><SmartImage src={channel.logo} alt={channel.name} fallback={<Radio />} /></div>
                      <div className="channel-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b>{channel.name}</b>
                          {isCurrent && <span className="live-pill" style={{ fontSize: 10, padding: '1px 5px' }}>当前</span>}
                        </div>
                        <small>
                          {isResolving ? '正在读取播放地址…' : isLazy ? 'TV1 · 地址按需读取' : 'Live'} · {streamCount ? streamCount + ' 条线路' : '未读取线路'}
                        </small>
                      </div>
                      <button className={favorite ? 'channel-favorite active-fav' : 'channel-favorite'} onClick={event => { event.stopPropagation(); toggleFavorite('channel', channel.channelId); }}>
                        <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button className="secondary" disabled={isResolving} onClick={event => { event.stopPropagation(); selectChannel(channel); if (channel.streams?.length) onPlay?.(channel); }}>
                        <Play size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
            ))}
            </div>
          )}

          {!tv1Loading && !allChannels.length && <EmptyState text="暂无可用 Live 频道" />}
        </>
      )}
    </Page>
  );
}

export function LiveChannelPanel({ channel, channels = [], favorites = [], onBack, onPlay, onChannel, toggleFavorite }) {
  const feature = useMemo(() => createLiveFeature({ channels }), [channels]);
  const [epg, setEpg] = useState(channel?.epg ?? []);
  const [epgLoading, setEpgLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (channel?.capabilities?.epg === false) {
      setEpg(channel?.epg ?? []);
      setEpgLoading(false);
      return () => { active = false; };
    }
    setEpg(channel?.epg ?? []);
    setEpgLoading(true);
    const now = Date.now();
    const range = {
      startAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(now + 4 * 60 * 60 * 1000).toISOString()
    };
    feature.getEPG(channel, range).then(items => {
      if (active && items.length) setEpg(items)
    }).catch(() => { }).finally(() => {
      if (active) setEpgLoading(false)
    });
    return () => { active = false }
  }, [channel, feature]);

  if (!channel) return <EmptyState text="频道不存在" />;
  const favorite = favorites.some(i => i.targetType === 'channel' && i.targetId === channel.channelId);
  const related = channels.filter(i => i.channelId !== channel.channelId && i.category === channel.category);

  return (
    <Page>
      <button className="back" onClick={onBack}><ChevronLeft />返回直播列表</button>
      <div className="detail-hero live-detail">
        <div className="channel-logo large">
          <SmartImage src={channel.logo} alt={channel.name} fallback={<Radio size={34} />} />
        </div>
        <div>
          <span className="eyebrow">{channel.category} · {channel.sourceRefs.length} 个来源</span>
          <h1>{channel.name}</h1>
          <p>● 正在直播 · {channel.streams.length} 条线路可用，频道身份与线路身份保持独立。</p>
          <div className="actions">
            <button className="primary" onClick={() => onPlay(channel)}><Play size={16} />播放</button>
            <button className={favorite ? 'secondary active-fav' : 'secondary'} onClick={() => toggleFavorite('channel', channel.channelId)}>
              <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
              {favorite ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      </div>
      <SectionTitle title="播放线路" />
      <div className="channel-list">
        {channel.streams.map(stream => (
          <button className="menu live-stream" key={stream.streamId} onClick={() => onPlay(channel, stream.streamId)}>
            <Radio size={18} />
            <span>{stream.label}<small>{stream.protocol} · {stream.sourceId}</small></span>
            <ChevronLeft className="flip" size={17} />
          </button>
        ))}
      </div>
      {channel.capabilities?.epg !== false && (
        <>
          <SectionTitle title="节目单" />
          {epgLoading && !epg.length && <LoadingState compact text="正在加载节目单…" />}
          {!epgLoading && !epg.length && <div className="empty compact"><span>暂无节目单</span></div>}
          {!!epg.length && (
            <div className="epg-list">
              {epg.map(program => (
                <div className="menu epg-item" key={program.programId}>
                  <span><b>{program.title || '未命名节目'}</b><small>{program.startAt || '—'} - {program.endAt || '—'}</small></span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!!related.length && (
        <>
          <SectionTitle title="频道列表" />
          <div className="channel-list">
            {channels.map(item => (
              <button className="menu" key={item.channelId} onClick={() => onChannel(item)}>
                <Radio size={18} />
                <span>{item.name}<small>{item.category}</small></span>
                <ChevronLeft className="flip" size={17} />
              </button>
            ))}
          </div>
          <SectionTitle title="同分类频道" />
          <div className="channel-list">
            {related.map(item => (
              <button className="menu" key={item.channelId} onClick={() => onChannel(item)}>
                <Radio size={18} />
                <span>{item.name}<small>{item.streams.length} 条线路</small></span>
                <ChevronLeft className="flip" size={17} />
              </button>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

const Page = ({ children }) => <main className="page">{children}</main>;
const Header = ({ title }) => <header><div><span className="eyebrow">TVBOX REACT · LIVE</span><h2>{title}</h2></div></header>;
const SectionTitle = ({ title }) => <div className="section-title"><h3>{title}</h3></div>;
const InfoCard = ({ title, text }) => <div className="info-card"><Radio size={18} /><div><b>{title}</b><span>{text}</span></div></div>;
export const Empty = ({ text }) => <div className="empty"><Radio size={22} /><span>{text}</span></div>;
