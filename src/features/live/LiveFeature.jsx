import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ChevronLeft, Heart, Play, Radio } from 'lucide-react';
import { liveService } from '../../services/liveService.js';
import { requestManager } from '../../services/requestManager.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState, LoadingState, ErrorState } from '../../components/StateViews.jsx';
import { SangtianPlayerWindow } from '../../components/theme/SangtianPlayerConsole.jsx';

const ALL_CATEGORY = '全部';

export function createLiveFeature({ channels = [] } = {}) {
  return {
    getCategories() { return liveService.getCategories(channels) },
    list(options = {}) { return liveService.listChannels(channels, options) },
    getChannel(id) { return liveService.getById(channels, id) },
    async getEPG(channel, range) { return liveService.getEPG(channel, range) }
  }
}

export function LiveFeature({ channels = [], favorites = [], onChannel, onPlay, onTab, toggleFavorite }) {
  const feature = useMemo(() => createLiveFeature({ channels }), [channels]);
  const page = usePageState();
  const videoRef = useRef(null);

  const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.channelId || '');
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);

  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].channelId);
    }
  }, [channels, selectedChannelId]);

  const activeChannel = useMemo(() => {
    return channels.find(c => c.channelId === selectedChannelId) || channels[0] || null;
  }, [channels, selectedChannelId]);

  const activeStream = useMemo(() => {
    return activeChannel?.streams?.[activeStreamIndex] || activeChannel?.streams?.[0] || null;
  }, [activeChannel, activeStreamIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream?.url) return;

    const url = activeStream.url;
    let hls = null;

    if (Hls.isSupported() && (url.includes('.m3u8') || activeStream.protocol === 'hls' || url.includes('m3u8'))) {
      try {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls.loadSource(url);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
      } catch {
        video.src = url;
        video.play().catch(() => {});
      }
    } else {
      video.src = url;
      video.play().catch(() => {});
    }

    return () => {
      if (hls) {
        try {
          hls.destroy();
        } catch {}
      }
    };
  }, [activeStream?.url]);

  useEffect(() => {
    const top = Number(page.live.scrollTop) || 0;
    requestAnimationFrame(() => window.scrollTo(0, top));
    const save = () => pageStateStore.patch('live', { scrollTop: window.scrollY });
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  const category = page.live.category;
  const categories = useMemo(() => feature.getCategories(), [feature]);
  const visible = useMemo(() => feature.list({ category }), [feature, category]);

  if (!channels.length) return <Page><Header title="直播" /><EmptyState text="暂无 Live 频道" /></Page>;

  return (
    <Page>
      <Header title="直播" />

      {/* 1. Top Video Playback Window matching the image with landscape and web fullscreen */}
      {activeChannel && (
        <>
          <SangtianPlayerWindow
            videoRef={videoRef}
            status={activeStream ? 'playing' : 'idle'}
            candidate={{
              label: activeStream?.label || '默认线路',
              url: activeStream?.url,
              protocol: activeStream?.protocol || 'HLS/M3U8',
              sourceId: activeChannel?.sourceRefs?.[0]?.sourceId,
            }}
            terminalTag={`LIVE · ${activeChannel.name}`}
          >
            <video
              ref={videoRef}
              controls
              playsInline
              autoPlay
              className="sangtian-video-element"
            />
          </SangtianPlayerWindow>

          {/* Current Channel Bar & Stream Selector */}
          <div className="live-current-bar">
            <div className="live-current-info">
              <span className="live-pill">● 正在直播</span>
              <b>{activeChannel.name}</b>
              <small>{activeChannel.category} · {activeStream?.label || '线路 1'}</small>
            </div>
            <div className="live-current-actions">
              {activeChannel.streams?.length > 1 && (
                <div className="stream-switcher">
                  {activeChannel.streams.map((s, idx) => (
                    <button
                      key={s.streamId || idx}
                      className={activeStreamIndex === idx ? 'active' : ''}
                      onClick={() => setActiveStreamIndex(idx)}
                    >
                      {s.label || `线路 ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="secondary icon-button"
                onClick={() => toggleFavorite('channel', activeChannel.channelId)}
                title="收藏频道"
              >
                <Heart
                  size={16}
                  fill={favorites.some(i => i.targetType === 'channel' && i.targetId === activeChannel.channelId) ? 'currentColor' : 'none'}
                />
              </button>
              <button
                className="primary"
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => onPlay?.(activeChannel, activeStream?.streamId)}
                title="进入全屏详情"
              >
                <Play size={13} /> 沉浸播放
              </button>
            </div>
          </div>
        </>
      )}

      {/* 2. Category Chips */}
      <div className="chips">
        {categories.map(item => (
          <button key={item} className={category === item ? 'active' : ''} onClick={() => pageStateStore.patch('live', { category: item })}>
            {item}
          </button>
        ))}
      </div>

      {/* 3. Channel List */}
      <div className="channel-list">
        {visible.map(channel => {
          const isCurrent = channel.channelId === activeChannel?.channelId;
          const favorite = favorites.some(i => i.targetType === 'channel' && i.targetId === channel.channelId);
          return (
            <div
              className={`channel ${isCurrent ? 'active-playing' : ''}`}
              key={channel.channelId}
              onClick={() => {
                setSelectedChannelId(channel.channelId);
                setActiveStreamIndex(0);
              }}
            >
              <div className="channel-logo">
                <SmartImage src={channel.logo} alt={channel.name} fallback={<Radio />} />
              </div>
              <div className="channel-main">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b>{channel.name}</b>
                  {isCurrent && <span className="live-pill" style={{ fontSize: 10, padding: '1px 5px' }}>播放中</span>}
                </div>
                <small>{channel.category} · {channel.streams.length} 条线路 · {channel.sourceRefs.length} 个来源</small>
                {(() => {
                  const current = (channel.capabilities?.currentProgram || channel.capabilities?.upcomingProgram)
                    ? (liveService.getCurrentEPG(channel).find(program => program.status === 'live') ?? liveService.getCurrentEPG(channel).find(program => program.status === 'upcoming'))
                    : null;
                  return current ? (
                    <small>{current.status === 'live' ? '当前' : '下一'}：{current.title || '未命名节目'} · {current.startAt || '—'}–{current.endAt || '—'}</small>
                  ) : null;
                })()}
              </div>
              <button className={favorite ? 'channel-favorite active-fav' : 'channel-favorite'} onClick={e => { e.stopPropagation(); toggleFavorite('channel', channel.channelId) }}>
                <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
              </button>
              <button
                className="secondary"
                onClick={e => {
                  e.stopPropagation();
                  setSelectedChannelId(channel.channelId);
                  setActiveStreamIndex(0);
                  onPlay(channel);
                }}
                title="沉浸播放"
              >
                <Play size={17} />
              </button>
            </div>
          );
        })}
      </div>
      {!visible.length && <EmptyState text="当前分类没有频道" />}
      <InfoCard title="Live 数据边界" text="页面只消费标准 Channel；源解析、合并、多线路与 EPG 均由 Live Service / Adapter 负责。" />
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
