import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, Film, Radio, Heart, User, Search, ChevronLeft, Play, Clock3, Settings, Database, Server, Info, X } from 'lucide-react';
import './styles/app.css';
import { movies as normalizedMovies, channels as normalizedChannels, sourceConfigs } from './data/demoData';
import { contentService } from './services/contentService';
import { liveService } from './services/liveService';
import { playbackService } from './services/playbackService';
import { createPlaybackCore } from './playback/playbackCore';
import { usePersistentState } from './state/usePersistentState.js';
import { useSessionState } from './state/useSessionState.js';
import { sessionStateStore } from './state/sessionStateStore.js';

const movies = contentService.getMovies(normalizedMovies);
const channels = liveService.getChannels(normalizedChannels);


function App() {
  const session = useSessionState();
  const persistent = usePersistentState();
  const [query, setQuery] = useState('');
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
    setQuery('');
    sessionStateStore.patch({ tab: key, route: null, selected: null });
  };
  const updateSources = (next) => persistent.saveSources(next);
  return <div className="app-shell"><div className="screen">
    {route === 'detail' ? <Detail movie={selected} onBack={() => sessionStateStore.patch({ route: null })} onPlay={playMovie} fav={persistent.favorites.some((x) => x.targetType === 'content' && x.targetId === selected.contentId)} onFav={() => persistent.toggleFavorite('content', selected.contentId)} />
      : route === 'movie-play' ? <Player request={selected} onBack={() => sessionStateStore.patch({ route: 'detail' })} />
      : route === 'live-play' ? <LivePlayer request={selected} onBack={() => sessionStateStore.patch({ route: null })} />
      : <Main tab={tab} movies={movies} channels={channels} query={query} setQuery={setQuery} onMovie={openMovie} onPlay={playMovie} favorites={persistent.favorites} history={persistent.history} progress={persistent.progress} toggleFav={persistent.toggleFavorite} sources={persistent.sources} setSources={updateSources} searches={persistent.searches} recordSearch={persistent.recordSearch} onLive={(channel) => { sessionStateStore.patch({ selected: playbackService.createLiveRequest({ channel, metadata: { title: channel.name, category: channel.category } }), route: 'live-play' }); }} onTab={nav} onClearData={persistent.clearUserData} />}
    {!route && <BottomNav tab={tab} onTab={nav} />}
  </div></div>;
}

function Main(p) {
  const movieCats = ['全部', '电影', '电视剧', '动漫', '综艺', '纪录片'];
  const liveCats = ['全部', '新闻', '综合', '体育', '音乐'];
  const [cat, setCat] = useState('全部');
  const filtered = useMemo(() => p.movies.filter((m) => (cat === '全部' || m.category === cat || cat === '电视剧' && m.episodes.length > 1) && (!p.query || m.title.includes(p.query))), [cat, p.query, p.movies]);
  if (p.tab === 'home') return <Page><Header title="TVBox" /><section className="hero"><div><span className="eyebrow">TVBOX REACT · 竖屏版</span><h1>你的内容，<br />统一进入一个体验。</h1><p>影视、Live、收藏与历史，基于标准化数据边界组织。</p><button className="primary" onClick={() => p.onTab('movies')}><Play size={16} />开始浏览</button></div><div className="hero-orb"><Film size={72} /></div></section><SectionTitle title="继续观看" /><div className="continue-row">{p.history.length ? p.history.slice(0, 4).map((h) => { const m = p.movies.find((x) => x.contentId === h.targetId); const epIndex = Math.max(0, m?.episodes.findIndex((ep) => ep.episodeId === h.episodeId) ?? 0); return m ? <div className="continue" key={h.historyId} onClick={() => p.onPlay(m, epIndex)}><img src={m.poster} /><div><b>{m.title}</b><small>{m.episodeId ? `第${epIndex + 1}集` : '继续观看'}</small></div></div> : null; }) : <Empty compact text="暂无观看记录" />}</div><SectionTitle title="热门影视" action="全部" onAction={() => p.onTab('movies')} /><MovieGrid movies={p.movies.slice(0, 4)} onMovie={p.onMovie} /><SectionTitle title="Live 快捷入口" /><div className="live-banner" onClick={() => p.onTab('live')}><Radio /><div><b>Live 直播中心</b><span>{p.channels.length} 个演示频道 · 影视与 Live 数据模型独立</span></div><ChevronLeft className="flip" /></div></Page>;
  if (p.tab === 'movies') return <Page><Header title="影视" /><div className="searchbox"><Search size={18} /><input value={p.query} onChange={(e) => p.setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && p.recordSearch(p.query)} placeholder="搜索影视内容" /><X size={16} onClick={() => p.setQuery('')} /></div><div className="chips">{movieCats.map((c) => <button className={cat === c ? 'active' : ''} onClick={() => setCat(c)} key={c}>{c}</button>)}</div><MovieGrid movies={filtered} onMovie={p.onMovie} />{!filtered.length && <Empty text="没有找到相关内容" />}</Page>;
  if (p.tab === 'live') return <Page><Header title="直播" /><div className="chips">{liveCats.map((c) => <button className={cat === c ? 'active' : ''} onClick={() => setCat(c)} key={c}>{c}</button>)}</div><div className="channel-list">{p.channels.filter((c) => cat === '全部' || c.category === cat).map((c) => <div className="channel" key={c.channelId} onClick={() => p.onLive(c)}><div className="channel-logo"><Radio /></div><div><b>{c.name}</b><small>{c.category} · {c.streams.length} 条线路</small></div><Play size={17} /></div>)}</div><InfoCard title="Live 数据边界" text="频道、线路、EPG 与影视内容保持独立；源刷新不直接改写用户数据。" /></Page>;
  if (p.tab === 'favorites') { const favMovies = p.movies.filter((m) => p.favorites.some((x) => x.targetType === 'content' && x.targetId === m.contentId)); return <Page><Header title="收藏" /><div className="seg"><button className="active">影视</button><button>Live</button></div><MovieGrid movies={favMovies} onMovie={p.onMovie} />{!favMovies.length && <Empty text="还没有收藏内容" />}</Page>; }
  if (p.tab === 'history') { const historyMovies = p.history.map((h) => p.movies.find((m) => m.contentId === h.targetId)).filter(Boolean); return <Page><Header title="播放历史" /><MovieGrid movies={historyMovies} onMovie={p.onMovie} />{!historyMovies.length && <Empty text="还没有播放历史" />}</Page>; }
  if (p.tab === 'search-history') return <Page><Header title="搜索历史" /><div className="history-list">{p.searches.map((s) => <div className="menu" key={s.searchId}><Search size={18} /><span>{s.keyword}</span><em>{s.count} 次</em></div>)}{!p.searches.length && <Empty text="还没有搜索历史" />}</div></Page>;
  if (p.tab === 'sources') return <Page><Header title="源管理" />{p.sources.map((s) => <div className="menu" key={s.sourceId}><Server size={19} /><span>{s.name}<small>{s.sourceType} · {s.status}</small></span><em>{s.enabled ? '启用' : '停用'}</em></div>)}<InfoCard title="本阶段边界" text="源配置属于用户本地配置；影视与 Live 源身份分开，具体适配将在后续施工阶段进入 Adapter。" /></Page>;
  if (p.tab === 'settings') return <Page><Header title="设置" /><Menu icon={Settings} title="数据清理" onClick={() => { p.onClearData(); alert('用户收藏、历史、进度与搜索历史已清理，源配置保持不变。'); }} /><InfoCard title="数据保护" text="清理用户数据不会删除源配置；外部源刷新也不会直接覆盖用户数据。" /></Page>;
  return <Page><Header title="我的" /><div className="profile"><div className="avatar">T</div><div><b>TVBox 用户</b><span>本地数据独立存储 · Playback Candidate 施工版</span></div></div><Menu icon={Clock3} title="播放历史" onClick={() => p.onTab('history')} badge={p.history.length} /><Menu icon={Search} title="搜索历史" onClick={() => p.onTab('search-history')} badge={p.searches.length} /><Menu icon={Server} title="源管理" onClick={() => p.onTab('sources')} badge={p.sources.length} /><Menu icon={Settings} title="设置" onClick={() => p.onTab('settings')} /><Menu icon={Database} title="数据管理" onClick={() => p.onTab('settings')} /><Menu icon={Info} title="关于" onClick={() => alert('TVBox React v0.3.0\nPlayback Candidate 与播放链路施工版')} /></Page>;
}

function Detail({ movie, onBack, onPlay, fav, onFav }) { return <Page><button className="back" onClick={onBack}><ChevronLeft />返回</button><div className="detail-hero"><img src={movie.poster} /><div><span className="eyebrow">{movie.category} · {movie.year}</span><h1>{movie.title}</h1><p>{movie.description}</p><div className="actions"><button className="primary" onClick={() => onPlay(movie, 0)}><Play size={16} />播放</button><button className={fav ? 'secondary active-fav' : 'secondary'} onClick={onFav}><Heart size={16} fill={fav ? 'currentColor' : 'none'} />{fav ? '已收藏' : '收藏'}</button></div></div></div><SectionTitle title="剧集" /><div className="episode-grid">{movie.episodes.map((e, i) => <button key={e.episodeId} onClick={() => onPlay(movie, i)}>{e.title}</button>)}</div><InfoCard title="来源关系" text={`标准内容身份：${movie.contentId} · 来源数量：${movie.sourceRefs.length} · 播放时再选择具体来源。`} /></Page>; }
function PlaybackView({ request, kind, onBack }) {
  const [status, setStatus] = useState('idle');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const videoRef = React.useRef(null);
  const task = useMemo(() => playbackService.createTask(request), [request]);
  const core = useMemo(() => createPlaybackCore(task, {
    onEvent: (event) => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'released') setStatus('released');
      if (event.event === 'stopped') setStatus('stopped');
    },
    onStateChange: (next) => setStatus(next),
    onCandidateChange: (next) => {
      setCandidate(next);
      setResolvedInput(null);
      if (next) setError('');
    },
    onResolvedInput: (input) => setResolvedInput(input),
    onParserError: ({ code }) => {
      setResolvedInput(null);
      setError(`解析失败：${code}`);
    },
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
      core.resolveAndLoad(initial).catch((loadError) => {
        setError(loadError?.message || '播放初始化失败');
      });
    }
    return () => {
      core.stop();
      core.release();
      void player;
    };
  }, [core]);

  const switchCandidate = (candidateId) => {
    const next = core.switchCandidate(candidateId);
    if (next) {
      setCandidate(next);
      setResolvedInput(null);
      setStatus('loading');
    }
  };

  const title = request?.metadata?.title ?? '播放';
  const subtitle = kind === 'live'
    ? `${request?.metadata?.category ?? ''} · ${request?.candidates?.length ?? 0} 条候选`
    : `${request?.metadata?.episodeTitle ?? ''} · ${request?.candidates?.length ?? 0} 条候选`;

  return <div className="player-page">
    <button className="back player-back" onClick={onBack}><ChevronLeft />退出{kind === 'live' ? '直播' : '播放'}</button>
    <div className="video-wrap">
      <video ref={videoRef} controls playsInline poster={request?.metadata?.poster} />
      {!resolvedInput && candidate && status !== 'error' && <div className="video-overlay">正在解析播放地址…</div>}
      {status === 'error' && <div className="video-error">{error || '当前播放链路没有可用候选。'}</div>}
    </div>
    <div className="player-info">
      <span className="eyebrow">{kind === 'live' ? 'LIVE' : 'VOD'} · Playback Core</span>
      <h2>{title}</h2>
      <p>{subtitle} · 状态：{status}</p>
      <div className="chips">{request?.candidates?.map((item) => <button key={item.candidateId} className={candidate?.candidateId === item.candidateId ? 'active' : ''} onClick={() => switchCandidate(item.candidateId)}>{item.metadata?.label ?? item.label ?? item.protocol}</button>)}</div>
      <small>候选身份：{candidate?.candidateId ?? '—'} · 来源：{candidate?.sourceId ?? '—'} · 解析结果：{resolvedInput?.protocol ?? '等待'}</small>
    </div>
  </div>;
}

function Player({ request, onBack }) { return <PlaybackView request={request} kind="vod" onBack={onBack} />; }
function LivePlayer({ request, onBack }) { return <PlaybackView request={request} kind="live" onBack={onBack} />; }
const Page = ({ children }) => <main className="page">{children}</main>;
const Header = ({ title }) => <header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle = ({ title, action, onAction }) => <div className="section-title"><h3>{title}</h3>{action && <button onClick={onAction}>{action}</button>}</div>;
const MovieGrid = ({ movies: items, onMovie }) => <div className="movie-grid">{items.map((m) => <article className="movie-card" key={m.contentId} onClick={() => onMovie(m)}><img src={m.poster} /><div><b>{m.title}</b><span>{m.year} · {m.category}</span></div></article>)}</div>;
const Empty = ({ text, compact }) => <div className={compact ? 'empty compact' : 'empty'}><Film size={22} /><span>{text}</span></div>;
const InfoCard = ({ title, text }) => <div className="info-card"><Info size={18} /><div><b>{title}</b><span>{text}</span></div></div>;
const Menu = ({ icon: Icon, title, onClick, badge }) => <button className="menu" onClick={onClick}><Icon size={19} /><span>{title}</span>{badge > 0 && <em>{badge}</em>}<ChevronLeft className="flip" size={17} /></button>;
const BottomNav = ({ tab, onTab }) => <nav>{[['home', Home, '首页'], ['movies', Film, '影视'], ['live', Radio, '直播'], ['favorites', Heart, '收藏'], ['me', User, '我的']].map(([k, I, l]) => <button className={tab === k ? 'active' : ''} onClick={() => onTab(k)} key={k}><I size={21} fill={tab === k ? 'currentColor' : 'none'} /><span>{l}</span></button>)}</nav>;
createRoot(document.getElementById('root')).render(<App />);
