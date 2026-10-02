import React from 'react';
import { ChevronLeft, Clock3, Database, Film, Info, Radio, Search, Server, Settings } from 'lucide-react';

function Main({
  tab,
  movies,
  channels,
  favorites,
  history,
  sources,
  searches,
  onTab,
  onMovie,
  onLive,
  onLiveChannel,
  toggleFavorite,
  onClearData,
  onClearCache,
}) {
  if (tab === 'live') {
    return (
      <LiveFeature
        channels={channels}
        favorites={favorites}
        onChannel={onLiveChannel}
        onPlay={onLive}
        onTab={onTab}
        toggleFavorite={toggleFavorite}
      />
    );
  }

  if (tab === 'favorites') {
    const favMovies = movies.filter((movie) =>
      favorites.some((item) => item.targetType === 'content' && item.targetId === movie.contentId),
    );
    const favChannels = channels.filter((channel) =>
      favorites.some((item) => item.targetType === 'channel' && item.targetId === channel.channelId),
    );
    return (
      <Page>
        <Header title="收藏" />
        <div className="seg"><button className="active">影视</button></div>
        <MovieGrid movies={favMovies} onMovie={onMovie} />
        <SectionTitle title="Live 频道" />
        <div className="channel-list">
          {favChannels.map((channel) => (
            <button className="menu" key={channel.channelId} onClick={() => onLiveChannel(channel)}>
              <Radio size={18} />
              <span>{channel.name}<small>{channel.category} · {channel.streams.length} 条线路</small></span>
              <ChevronLeft className="flip" size={17} />
            </button>
          ))}
        </div>
        {!favMovies.length && !favChannels.length && <Empty text="还没有收藏内容" />}
      </Page>
    );
  }

  if (tab === 'history') {
    const historyMovies = history
      .filter((item) => item.targetType === 'content')
      .map((item) => movies.find((movie) => movie.contentId === item.targetId))
      .filter(Boolean);
    const historyChannels = history
      .filter((item) => item.targetType === 'channel')
      .map((item) => channels.find((channel) => channel.channelId === item.targetId))
      .filter(Boolean);
    return (
      <Page>
        <Header title="播放历史" />
        <MovieGrid movies={historyMovies} onMovie={onMovie} />
        {!!historyChannels.length && <SectionTitle title="Live" />}
        <div className="channel-list">
          {historyChannels.map((channel) => (
            <button className="menu" key={channel.channelId} onClick={() => onLiveChannel(channel)}>
              <Radio size={18} />
              <span>{channel.name}<small>{channel.category}</small></span>
              <ChevronLeft className="flip" size={17} />
            </button>
          ))}
        </div>
        {!historyMovies.length && !historyChannels.length && <Empty text="还没有播放历史" />}
      </Page>
    );
  }

  if (tab === 'search-history') {
    return (
      <Page>
        <Header title="搜索历史" />
        <div className="history-list">
          {searches.map((item) => <div className="menu" key={item.searchId}><Search size={18} /><span>{item.keyword}</span><em>{item.count} 次</em></div>)}
          {!searches.length && <Empty text="还没有搜索历史" />}
        </div>
      </Page>
    );
  }

  if (tab === 'sources') {
    return (
      <Page>
        <Header title="源管理" />
        {sources.map((source) => <div className="menu" key={source.sourceId}><Server size={19} /><span>{source.name}<small>{source.sourceType} · {source.status}</small></span><em>{source.enabled ? '启用' : '停用'}</em></div>)}
        <InfoCard title="本阶段边界" text="源配置属于用户本地配置；影视与 Live 源身份分开，具体适配进入 Adapter 边界。" />
      </Page>
    );
  }

  if (tab === 'settings') {
    return (
      <Page>
        <Header title="设置" />
        <Menu icon={Settings} title="数据清理" onClick={() => { onClearData(); alert('用户收藏、历史、进度与搜索历史已清理，源配置保持不变。'); }} />
        <Menu icon={Database} title="缓存清理" onClick={() => { onClearCache(); alert('缓存已清理，收藏、历史、进度、搜索历史、源配置与设置保持不变。'); }} />
        <InfoCard title="数据保护" text="清理用户数据不会删除源配置；外部源刷新也不会直接覆盖用户数据。" />
      </Page>
    );
  }

  return (
    <Page>
      <Header title="我的" />
      <div className="profile"><div className="avatar">T</div><div><b>TVBox 用户</b><span>本地数据独立存储 · Live 业务迁移版</span></div></div>
      <Menu icon={Clock3} title="播放历史" onClick={() => onTab('history')} badge={history.length} />
      <Menu icon={Search} title="搜索历史" onClick={() => onTab('search-history')} badge={searches.length} />
      <Menu icon={Server} title="源管理" onClick={() => onTab('sources')} badge={sources.length} />
      <Menu icon={Settings} title="设置" onClick={() => onTab('settings')} />
      <Menu icon={Database} title="数据管理" onClick={() => onTab('settings')} />
      <Menu icon={Info} title="关于" onClick={() => alert('TVBox React v0.3.0\nLive 页面业务迁移版')} />
    </Page>
  );
}

const Page = ({ children }) => <main className="page">{children}</main>;
const Header = ({ title }) => <header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle = ({ title }) => <div className="section-title"><h3>{title}</h3></div>;
const InfoCard = ({ title, text }) => <div className="info-card"><Info size={18} /><div><b>{title}</b><span>{text}</span></div></div>;
const Empty = ({ text }) => <div className="empty"><Film size={22} /><span>{text}</span></div>;
const MovieGrid = React.memo(function MovieGrid({ movies: items, onMovie }) { return <div className="movie-grid">{items.map((movie) => <article className="movie-card" key={movie.contentId} onClick={() => onMovie(movie)}><img src={movie.poster} loading="lazy" decoding="async" /><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>; });
const Menu = ({ icon: Icon, title, onClick, badge }) => <button className="menu" onClick={onClick}><Icon size={19} /><span>{title}</span>{badge > 0 && <em>{badge}</em>}<ChevronLeft className="flip" size={17} /></button>;

export { Main as MainPage };