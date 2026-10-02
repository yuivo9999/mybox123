import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Heart, Play, Radio } from 'lucide-react';
import { liveService } from '../../services/liveService.js';

const ALL_CATEGORY = '全部';

export function createLiveFeature({ channels = [] } = {}) {
  return {
    getCategories() {
      return liveService.getCategories(channels);
    },
    list(options = {}) {
      return liveService.listChannels(channels, options);
    },
    getChannel(channelId) {
      return liveService.getById(channels, channelId);
    },
    async getEPG(channel, range) {
      return liveService.getEPG(channel, range);
    },
  };
}

export function LiveFeature({
  channels = [],
  favorites = [],
  onChannel,
  onPlay,
  onTab,
  toggleFavorite,
}) {
  const feature = useMemo(() => createLiveFeature({ channels }), [channels]);
  const [category, setCategory] = useState(ALL_CATEGORY);
  const categories = useMemo(() => feature.getCategories(), [feature]);
  const visibleChannels = useMemo(() => feature.list({ category }), [feature, category]);

  return (
    <Page>
      <Header title="直播" />
      <div className="chips">
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="channel-list">
        {visibleChannels.map((channel) => {
          const favorite = favorites.some(
            (item) => item.targetType === 'channel' && item.targetId === channel.channelId,
          );
          return (
            <div className="channel" key={channel.channelId} onClick={() => onChannel(channel)}>
              <div className="channel-logo">
                {channel.logo ? <img src={channel.logo} alt="" loading="lazy" decoding="async" /> : <Radio />}
              </div>
              <div className="channel-main">
                <b>{channel.name}</b>
                <small>
                  {channel.category} · {channel.streams.length} 条线路 · {channel.sourceRefs.length} 个来源
                </small>
              </div>
              <button
                className={favorite ? 'channel-favorite active-fav' : 'channel-favorite'}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite('channel', channel.channelId);
                }}
                aria-label={favorite ? '取消收藏' : '收藏频道'}
              >
                <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
              </button>
              <button
                className="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  onPlay(channel);
                }}
              >
                <Play size={17} />
              </button>
            </div>
          );
        })}
      </div>

      {!visibleChannels.length && <Empty text="当前分类没有频道" />}
      <InfoCard
        title="Live 数据边界"
        text="页面只消费标准 Channel；源解析、合并、多线路与 EPG 均由 Live Service / Adapter 负责。"
      />
    </Page>
  );
}

export function LiveChannelPanel({
  channel,
  channels = [],
  favorites = [],
  onBack,
  onPlay,
  onChannel,
  toggleFavorite,
}) {
  const feature = useMemo(() => createLiveFeature({ channels }), [channels]);
  const [epg, setEpg] = useState(channel?.epg ?? []);
  const [epgLoading, setEpgLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setEpg(channel?.epg ?? []);
    setEpgLoading(true);
    const now = Date.now();
    const range = {
      startAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
    };
    feature.getEPG(channel, range).then((items) => {
      if (active && items.length) setEpg(items);
    }).catch(() => {
      // EPG is optional; cached/empty state remains visible.
    }).finally(() => {
      if (active) setEpgLoading(false);
    });
    return () => { active = false; };
  }, [channel, feature]);

  if (!channel) return <Empty text="频道不存在" />;

  const favorite = favorites.some(
    (item) => item.targetType === 'channel' && item.targetId === channel.channelId,
  );
  const related = channels.filter((item) => item.channelId !== channel.channelId && item.category === channel.category);

  return (
    <Page>
      <button className="back" onClick={onBack}><ChevronLeft />返回直播列表</button>
      <div className="detail-hero live-detail">
        <div className="channel-logo large">
          {channel.logo ? <img src={channel.logo} alt="" loading="lazy" decoding="async" /> : <Radio size={34} />}
        </div>
        <div>
          <span className="eyebrow">{channel.category} · {channel.sourceRefs.length} 个来源</span>
          <h1>{channel.name}</h1>
          <p>{channel.streams.length} 条线路可用，频道身份与线路身份保持独立。</p>
          <div className="actions">
            <button className="primary" onClick={() => onPlay(channel)}><Play size={16} />播放</button>
            <button className={favorite ? 'secondary active-fav' : 'secondary'} onClick={() => toggleFavorite('channel', channel.channelId)}>
              <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      </div>

      <SectionTitle title="播放线路" />
      <div className="channel-list">
        {channel.streams.map((stream) => (
          <button className="menu live-stream" key={stream.streamId} onClick={() => onPlay(channel, stream.streamId)}>
            <Radio size={18} />
            <span>{stream.label}<small>{stream.protocol} · {stream.sourceId}</small></span>
            <ChevronLeft className="flip" size={17} />
          </button>
        ))}
      </div>

      <SectionTitle title="EPG" />
      {epgLoading && !epg.length && <div className="empty compact"><span>正在加载节目单…</span></div>}
      {!epgLoading && !epg.length && <div className="empty compact"><span>暂无节目单</span></div>}
      {!!epg.length && (
        <div className="epg-list">
          {epg.map((program) => (
            <div className="menu epg-item" key={program.programId}>
              <span><b>{program.title || '未命名节目'}</b><small>{program.startAt || '—'} - {program.endAt || '—'}</small></span>
            </div>
          ))}
        </div>
      )}

      {!!related.length && (
        <>
          <SectionTitle title="同分类频道" />
          <div className="channel-list">
            {related.map((item) => (
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
const Empty = ({ text }) => <div className="empty"><Radio size={22} /><span>{text}</span></div>;
