import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, Film, Radio, Heart, User, Search, ChevronLeft, Play, Clock3, Settings, Database, Server, Info } from 'lucide-react';
import './styles/app.css';
import { movies as normalizedMovies, channels as normalizedChannels } from './data/demoData';
import { contentService } from './services/contentService';
import { liveService } from './services/liveService';
import { playbackService } from './services/playbackService';
import { createPlaybackCore } from './playback/playbackCore';
import { usePersistentState } from './state/usePersistentState.js';
import { useSessionState } from './state/useSessionState.js';
import { sessionStateStore } from './state/sessionStateStore.js';
import { MovieFeature } from './features/movie/MovieFeature.jsx';
import { LiveFeature, LiveChannelPanel } from './features/live/LiveFeature.jsx';

const movies = contentService.getMovies(normalizedMovies);
const channels = liveService.getChannels(normalizedChannels);

function App() {
  const session = useSessionState();
  const persistent = usePersistentState();
  const { tab, route, selected } = session;

  const openMovie = (movie) => sessionStateStore.patch({ selected: movie, route: 'detail' });

  const playMovie = (movie, episodeIndex = 0) => {
    const episode = movie.episodes[episodeIndex] ?? movie.episodes[0];
    const request = playbackService.createVODRequest({
      content: movie,
      episode,
      episodeIndex,
      metadata: { title: movie.title, poster: movie.poster, episodeTitle: episode?.title ?? '' },
    });
    sessionStateStore.patch({ selected: request, route: 'movie-play' });
    persistent.recordMoviePlay(movie, episodeIndex);
  };

  const nav = (key) => {
    sessionStateStore.patch({ tab: key, route: null, selected: null });
  };

  const openLiveChannel = (channel) => {
    sessionStateStore.patch({ selected: channel, route: 'live-channel', tab: 'live' });
  };

  const playLive = (channel, streamId = null) => {
    const request = playbackService.createLiveRequest({
      channel,
      metadata: { title: channel.name, category: channel.category },
    });
    if (streamId) {
      const index = request.candidates.findIndex((candidate) => candidate.streamId === streamId);
      if (index >= 0) {
        request.candidates = [
          request.candidates[index],
          ...request.candidates.filter((_, itemIndex) => itemIndex !== index),
        ];
      }
    }
    sessionStateStore.patch({ selected: request, route: 'live-play', tab: 'live' });
    persistent.recordLivePlay(channel, streamId);
  };

  const movieFeatureActive = route === 'detail' || route === 'movie-play' || tab === 'home' || tab === 'movies';

  return (
    <div className="app-shell">
      <div className="screen">
        {movieFeatureActive ? (
          <MovieFeature
            route={route}
            tab={tab}
            selected={selected}
            movies={movies}
            channels={channels}
            history={persistent.history}
            favorites={persistent.favorites}
            onMovie={openMovie}
            onPlay={playMovie}
            onTab={nav}
            onBack={() => sessionStateStore.patch({ route: route === 'movie-play' ? 'detail' : null })}
            onLive={playLive}
            recordSearch={persistent.recordSearch}
            toggleFavorite={persistent.toggleFavorite}
          />
        ) : route === 'live-channel' ? (
          <LiveChannelPanel
            channel={selected}
            channels={channels}
            favorites={persistent.favorites}
            onBack={() => sessionStateStore.patch({ route: null, selected: null, tab: 'live' })}
            onPlay={playLive}
            onChannel={openLiveChannel}
            toggleFavorite={persistent.toggleFavorite}
          />
        ) : route === 'live-play' ? (
          <LivePlayer request={selected} onBack={() => sessionStateStore.patch({ route: selected?.channelId ? 'live-channel' : null })} />
        ) : (
          <Main
            tab={tab}
            movies={movies}
            channels={channels}
            favorites={persistent.favorites}
            history={persistent.history}
            sources={persistent.sources}
            searches={persistent.searches}
            onTab={nav}
            onMovie={openMovie}
            onLive={playLive}
            onLiveChannel={openLiveChannel}
            toggleFavorite={persistent.toggleFavorite}
            onClearData={persistent.clearUserData}
          />
        )}
        {!route && <BottomNav tab={tab} onTab={nav} />}
      </div>
    </div>
  );
}

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

function PlaybackView({ request, kind, onBack }) {
  const persistent = usePersistentState();
  const progressRef = React.useRef({ currentTime: 0, duration: null });
  const [status, setStatus] = useState('idle');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const videoRef = React.useRef(null);
  const task = useMemo(() => playbackService.createTask(request), [request]);

  const core = useMemo(() => createPlaybackCore(task, {
    onEvent: (event) => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'progress') progressRef.current = { currentTime: event.currentTime ?? 0, duration: event.duration ?? null };
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
  }, [core, kind, request, persistent]);

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

const Page = ({ children }) => <main className="page">{children}</main>;
const Header = ({ title }) => <header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle = ({ title }) => <div className="section-title"><h3>{title}</h3></div>;
const InfoCard = ({ title, text }) => <div className="info-card"><Info size={18} /><div><b>{title}</b><span>{text}</span></div></div>;
const Empty = ({ text }) => <div className="empty"><Film size={22} /><span>{text}</span></div>;
const MovieGrid = ({ movies: items, onMovie }) => <div className="movie-grid">{items.map((movie) => <article className="movie-card" key={movie.contentId} onClick={() => onMovie(movie)}><img src={movie.poster} /><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>;
const Menu = ({ icon: Icon, title, onClick, badge }) => <button className="menu" onClick={onClick}><Icon size={19} /><span>{title}</span>{badge > 0 && <em>{badge}</em>}<ChevronLeft className="flip" size={17} /></button>;
const BottomNav = ({ tab, onTab }) => <nav>{[['home', Home, '首页'], ['movies', Film, '影视'], ['live', Radio, '直播'], ['favorites', Heart, '收藏'], ['me', User, '我的']].map(([key, Icon, label]) => <button className={tab === key ? 'active' : ''} onClick={() => onTab(key)} key={key}><Icon size={21} fill={tab === key ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>;

createRoot(document.getElementById('root')).render(<App />);
