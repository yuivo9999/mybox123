import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Film, Heart, Play, Search, X } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { playbackService } from '../../services/playbackService.js';
import { createPlaybackCore } from '../../playback/playbackCore.js';
import { usePersistentState } from '../../state/usePersistentState.js';

const MOVIE_CATEGORIES = ['全部', '电影', '电视剧', '动漫', '综艺', '纪录片'];

export function MovieFeature(props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (tab !== 'movies') setQuery('');
  }, [tab]);

  const {
    route,
    tab,
    selected,
    movies,
    channels = [],
    history,
    favorites,
    onMovie,
    onPlay,
    onTab,
    onBack,
    onLive,
    recordSearch,
    toggleFavorite,
  } = props;

  const feature = useMemo(
    () => createMovieFeature({ movies, history }),
    [movies, history],
  );

  if (route === 'detail') {
    const movie = feature.getDetail(selected?.contentId ?? selected);
    if (!movie) return <MovieEmpty text="影视内容不存在" onBack={onBack} />;
    return (
      <MovieDetail
        movie={movie}
        favorite={favorites.some((item) => item.targetType === 'content' && item.targetId === movie.contentId)}
        onBack={onBack}
        onPlay={onPlay}
        onFavorite={() => toggleFavorite('content', movie.contentId)}
      />
    );
  }

  if (route === 'movie-play') {
    return <MoviePlayback request={selected} onBack={onBack} />;
  }

  if (tab === 'movies') {
    return (
      <MovieCatalog
        movies={movies}
        query={query}
        setQuery={setQuery}
        onMovie={onMovie}
        recordSearch={recordSearch}
      />
    );
  }

  return (
    <MovieHome
      feature={feature}
      channels={channels}
      onTab={onTab}
      onMovie={onMovie}
      onPlay={onPlay}
      onLive={onLive}
    />
  );
}

export function createMovieFeature({ movies = [], history = [] } = {}) {
  return {
    getHome: (options) => movieService.getHome({ movies, history, ...(options ?? {}) }),
    getList: (options) => movieService.list({ movies, ...(options ?? {}) }),
    search: (keyword) => movieService.search({ movies, keyword }),
    getDetail: (contentId) => movieService.getDetail({ movies, contentId }),
    getEpisode: (contentId, episodeId) => movieService.getEpisode({ movies, contentId, episodeId }),
  };
}

function MovieHome({ feature, channels, onTab, onMovie, onPlay, onLive }) {
  const home = feature.getHome();
  return (
    <Page>
      <Header title="TVBox" />
      <section className="hero">
        <div>
          <span className="eyebrow">TVBOX REACT · 竖屏版</span>
          <h1>你的内容，<br />统一进入一个体验。</h1>
          <p>影视、Live、收藏与历史，基于标准化数据边界组织。</p>
          <button className="primary" onClick={() => onTab('movies')}><Play size={16} />开始浏览</button>
        </div>
        <div className="hero-orb"><Film size={72} /></div>
      </section>

      <SectionTitle title="继续观看" />
      <div className="continue-row">
        {home.continueWatching.length
          ? home.continueWatching.map(({ movie, episodeIndex, history }) => (
              <div className="continue" key={history.historyId} onClick={() => onPlay(movie, episodeIndex)}>
                <img src={movie.poster} />
                <div><b>{movie.title}</b><small>{movie.episodes?.[episodeIndex]?.title ?? '继续观看'}</small></div>
              </div>
            ))
          : <MovieEmpty compact text="暂无观看记录" />}
      </div>

      <SectionTitle title="热门影视" action="全部" onAction={() => onTab('movies')} />
      <MovieGrid movies={home.popular} onMovie={onMovie} />

      <SectionTitle title="Live 快捷入口" />
      <div className="live-banner" onClick={() => onTab('live')}>
        <span><b>Live 直播中心</b><small>{channels.length} 个演示频道 · 影视与 Live 数据模型独立</small></span>
        <ChevronLeft className="flip" />
      </div>
      <button className="movie-live-entry" onClick={() => channels[0] && onLive(channels[0])}>
        <Play size={15} />直接播放示例频道
      </button>
    </Page>
  );
}

function MovieCatalog({ movies, query, setQuery, onMovie, recordSearch }) {
  const [category, setCategory] = useState('全部');
  const result = useMemo(() => (
    query.trim()
      ? movieService.search({ movies, keyword: query })
      : movieService.list({ movies, category }).items
  ), [movies, query, category]);

  return (
    <Page>
      <Header title="影视" />
      <div className="searchbox">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && recordSearch(query)}
          placeholder="搜索影视内容"
        />
        <X size={16} onClick={() => setQuery('')} />
      </div>
      <div className="chips">
        {MOVIE_CATEGORIES.map((item) => (
          <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>
        ))}
      </div>
      <MovieGrid movies={result} onMovie={onMovie} />
      {!result.length && <MovieEmpty text="没有找到相关内容" />}
    </Page>
  );
}

function MovieDetail({ movie, onBack, onPlay, favorite, onFavorite }) {
  return (
    <Page>
      <button className="back" onClick={onBack}><ChevronLeft />返回</button>
      <div className="detail-hero">
        <img src={movie.poster} />
        <div>
          <span className="eyebrow">{movie.category} · {movie.year}</span>
          <h1>{movie.title}</h1>
          <p>{movie.description}</p>
          <div className="actions">
            <button className="primary" onClick={() => onPlay(movie, 0)}><Play size={16} />播放</button>
            <button className={favorite ? 'secondary active-fav' : 'secondary'} onClick={onFavorite}>
              <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      </div>
      <SectionTitle title="剧集" />
      <div className="episode-grid">
        {movie.episodes.map((episode, index) => (
          <button key={episode.episodeId} onClick={() => onPlay(movie, index)}>{episode.title}</button>
        ))}
      </div>
      <div className="info-card">
        <div><b>来源关系</b><span>标准内容身份：{movie.contentId} · 来源数量：{movie.sourceRefs.length} · 播放时再选择具体来源。</span></div>
      </div>
    </Page>
  );
}

function MoviePlayback({ request, onBack }) {
  const persistent = usePersistentState();
  const progressRef = useRef({ currentTime: 0, duration: null });
  const [status, setStatus] = useState('idle');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const task = useMemo(() => playbackService.createTask(request), [request]);

  const core = useMemo(() => createPlaybackCore(task, {
    onEvent: (event) => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'progress') {
        progressRef.current = { currentTime: event.currentTime ?? 0, duration: event.duration ?? null };
      }
      if (event.event === 'completed' && request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        persistent.recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, true);
      }
      if (event.event === 'released') setStatus('released');
      if (event.event === 'stopped') setStatus('stopped');
    },
    onStateChange: setStatus,
    onCandidateChange: (next) => {
      setCandidate(next);
      setResolvedInput(null);
      if (next) setError('');
    },
    onResolvedInput: setResolvedInput,
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
      if (request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        if (progress.currentTime > 0) {
          persistent.recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
        }
      }
      core.stop();
      core.release();
      void player;
    };
  }, [core, request]);

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
      <button className="back player-back" onClick={onBack}><ChevronLeft />退出播放</button>
      <div className="video-wrap">
        <video ref={videoRef} controls playsInline poster={request?.metadata?.poster} />
        {!resolvedInput && candidate && status !== 'error' && <div className="video-overlay">正在解析播放地址…</div>}
        {status === 'error' && <div className="video-error">{error || '当前播放链路没有可用候选。'}</div>}
      </div>
      <div className="player-info">
        <span className="eyebrow">VOD · Playback Core</span>
        <h2>{request?.metadata?.title ?? '播放'}</h2>
        <p>{request?.metadata?.episodeTitle ?? ''} · {request?.candidates?.length ?? 0} 条候选 · 状态：{status}</p>
        <div className="chips">
          {request?.candidates?.map((item) => (
            <button key={item.candidateId} className={candidate?.candidateId === item.candidateId ? 'active' : ''} onClick={() => switchCandidate(item.candidateId)}>
              {item.metadata?.label ?? item.label ?? item.protocol}
            </button>
          ))}
        </div>
        <small>候选身份：{candidate?.candidateId ?? '—'} · 来源：{candidate?.sourceId ?? '—'} · 解析结果：{resolvedInput?.protocol ?? '等待'}</small>
      </div>
    </div>
  );
}

const Page = ({ children }) => <main className="page">{children}</main>;
const Header = ({ title }) => <header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle = ({ title, action, onAction }) => <div className="section-title"><h3>{title}</h3>{action && <button onClick={onAction}>{action}</button>}</div>;
const MovieGrid = React.memo(function MovieGrid({ movies, onMovie }) { return <div className="movie-grid">{movies.map((movie) => <article className="movie-card" key={movie.contentId} onClick={() => onMovie(movie)}><img src={movie.poster} loading="lazy" decoding="async" /><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>; });
const MovieEmpty = ({ text, compact, onBack }) => <div className={compact ? 'empty compact' : 'empty'}>{onBack && <button className="back" onClick={onBack}><ChevronLeft />返回</button>}<Film size={22} /><span>{text}</span></div>;
