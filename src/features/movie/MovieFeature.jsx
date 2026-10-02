import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Film, Heart, Play, Search, SlidersHorizontal, X } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { playbackService } from '../../services/playbackService.js';
import { createPlaybackCore } from '../../playback/playbackCore.js';
import { usePersistentState } from '../../state/usePersistentState.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState } from '../../components/StateViews.jsx';

const MOVIE_CATEGORIES=['全部','电影','电视剧','动漫','综艺','纪录片'];
const SORTS=[['default','默认'],['latest','最新'],['title','名称']];
const FILTER_TYPES=['全部','电影','电视剧','动漫','综艺','纪录片'];

export function MovieFeature(props){
  const { route,tab,selected,movies,channels=[],history,favorites,onMovie,onPlay,onTab,onBack,onLive,recordSearch,toggleFavorite }=props;
  const page=usePageState();
  const movieState=page.movies;
  const feature=useMemo(()=>createMovieFeature({movies,history}),[movies,history]);
  const setMovieState=(patch)=>pageStateStore.patch('movies',patch);
  useEffect(()=>{ if(tab!=='movies') return; },[tab]);

  if(route==='search') return <MovieSearch movies={movies} initial={page.search.query} recordSearch={recordSearch} onMovie={onMovie} onBack={onBack} onQuery={(query)=>pageStateStore.patch('search',{query})}/>;
  if(route==='detail'){
    const movie=feature.getDetail(selected?.contentId??selected);
    if(!movie)return <MovieEmpty text="影视内容不存在" onBack={onBack}/>;
    return <MovieDetail movie={movie} movies={movies} onMovie={onMovie} favorite={favorites.some((item)=>item.targetType==='content'&&item.targetId===movie.contentId)} onBack={onBack} onPlay={onPlay} onFavorite={()=>toggleFavorite('content',movie.contentId)}/>;
  }
  if(route==='movie-play') return <MoviePlayback request={selected} movies={movies} onBack={onBack} onEpisode={onPlay}/>;
  if(tab==='movies') return <MovieCatalog movies={movies} state={movieState} setState={setMovieState} onMovie={onMovie} onSearch={()=>onMovie(null,'search')} recordSearch={recordSearch}/>;
  return <MovieHome feature={feature} channels={channels} onTab={onTab} onMovie={onMovie} onPlay={onPlay} onLive={onLive} onSearch={()=>onMovie(null,'search')}/>;
}

export function createMovieFeature({movies=[],history=[]}={}){return{
 getHome:(options)=>movieService.getHome({movies,history,...(options??{})}),
 getList:(options)=>movieService.list({movies,...(options??{})}),
 search:(keyword)=>movieService.search({movies,keyword}),
 getDetail:(contentId)=>movieService.getDetail({movies,contentId}),
 getEpisode:(contentId,episodeId)=>movieService.getEpisode({movies,contentId,episodeId}),
 getRelated:(movie)=>movieService.getRelated({movies,movie}),
};}

function MovieHome({feature,channels,onTab,onMovie,onPlay,onLive,onSearch}){
 const home=feature.getHome();
 return <Page>
  <Header title="首页"/>
  <section className="hero"><div><span className="eyebrow">TVBOX REACT · 竖屏版</span><h1>你的内容，<br/>统一进入一个体验。</h1><p>影视、Live、收藏与历史，基于标准化数据边界组织。</p><div className="actions"><button className="primary" onClick={()=>onTab('movies')}><Play size={16}/>开始浏览</button><button className="secondary" onClick={onSearch}><Search size={16}/>搜索</button></div></div><div className="hero-orb"><Film size={72}/></div></section>
  <SectionTitle title="分类快捷入口"/><div className="chips">{home.categories.map((item)=><button key={item} onClick={()=>{pageStateStore.patch('movies',{category:item,page:1});onTab('movies')}}>{item}</button>)}</div>
  <SectionTitle title="继续观看"/>
  <div className="continue-row">{home.continueWatching.length?home.continueWatching.map(({movie,episodeIndex,history:item})=><div className="continue" key={item.historyId} onClick={()=>onPlay(movie,episodeIndex)}><SmartImage src={movie.poster} fallback={<div className="image-placeholder"><Film size={18}/></div>}/><div><b>{movie.title}</b><small>{movie.episodes?.[episodeIndex]?.title??'继续观看'} · {Math.floor((item.positionSeconds??0)/60)} 分钟</small></div></div>):<MovieEmpty compact text="暂无观看记录"/>}</div>
  <SectionTitle title="推荐内容" action="全部" onAction={()=>onTab('movies')}/><MovieGrid movies={home.recommended} onMovie={onMovie}/>
  <SectionTitle title="热门影视"/><MovieGrid movies={home.popular} onMovie={onMovie}/>
  <SectionTitle title="最新影视"/><MovieGrid movies={home.latest} onMovie={onMovie}/>
  <SectionTitle title="Live 快捷入口"/><div className="live-banner" onClick={()=>onTab('live')}><span><b>Live 直播中心</b><small>{channels.length} 个频道 · 影视与 Live 数据模型独立</small></span><ChevronLeft className="flip"/></div>
  {channels[0]&&<button className="movie-live-entry" onClick={()=>onLive(channels[0])}><Play size={15}/>直接播放示例频道</button>}
 </Page>;
}

function MovieCatalog({movies,state,setState,onMovie,onSearch,recordSearch}){
 const result=useMemo(()=>state.query.trim()?movieService.search({movies,keyword:state.query}):movieService.list({movies,...state}).items,[movies,state]);
 const apply=(patch)=>setState({...patch,page:patch.category||patch.filters||patch.sort?1:state.page});
 return <Page><Header title="影视"/><div className="searchbox"><Search size={18}/><input value={state.query} onChange={e=>setState({query:e.target.value,page:1})} onKeyDown={e=>e.key==='Enter'&&recordSearch(state.query)} placeholder="搜索影视内容"/>{state.query&&<X size={16} onClick={()=>setState({query:'',page:1})}/>}<button aria-label="搜索页面" onClick={onSearch}><Search size={16}/></button></div>
  <div className="chips">{MOVIE_CATEGORIES.map(item=><button className={state.category===item?'active':''} onClick={()=>apply({category:item})} key={item}>{item}</button>)}</div>
  <div className="filter-row"><span>筛选：{state.filters.type||'全部'}</span><select value={state.filters.type||'全部'} onChange={e=>setState({filters:{...state.filters,type:e.target.value},page:1})}>{FILTER_TYPES.map(x=><option key={x}>{x}</option>)}</select><select value={state.sort} onChange={e=>setState({sort:e.target.value,page:1})}>{SORTS.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>
  <MovieGrid movies={result} onMovie={onMovie}/>{!result.length&&<MovieEmpty text="没有找到相关内容"/>}
  {result.length>0&&<div className="pagination"><button disabled={state.page<=1} onClick={()=>setState({page:state.page-1})}>上一页</button><span>第 {state.page} 页</span><button disabled={!movieService.list({movies,...state}).hasMore} onClick={()=>setState({page:state.page+1})}>下一页</button></div>}
 </Page>;
}

function MovieSearch({movies,initial,recordSearch,onMovie,onBack,onQuery}){
 const [query,setQuery]=useState(initial||''); const result=useMemo(()=>movieService.search({movies,keyword:query}),[movies,query]);
 return <Page><button className="back" onClick={onBack}><ChevronLeft/>返回</button><Header title="搜索"/><div className="searchbox"><Search size={18}/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);onQuery(e.target.value)}} onKeyDown={e=>e.key==='Enter'&&recordSearch(query)} placeholder="搜索影视内容"/>{query&&<X size={16} onClick={()=>{setQuery('');onQuery('')}}/>}</div>{!query&&<EmptyState text="输入关键词搜索影视"/>}{query&&<><SectionTitle title="搜索结果"/><MovieGrid movies={result} onMovie={onMovie}/>{!result.length&&<MovieEmpty text="搜索无结果"/>}</>}</Page>;
}

function MovieDetail({movie,movies,onMovie,onBack,onPlay,favorite,onFavorite}){
 const [sourceId,setSourceId]=useState(movie.sourceRefs?.[0]?.sourceId??''); const related=movieService.getRelated({movies,movie});
 const sourceIds=[...new Set((movie.sourceRefs??[]).map((ref)=>ref.sourceId).filter(Boolean))];
 return <Page><button className="back" onClick={onBack}><ChevronLeft/>返回</button><div className="detail-hero"><SmartImage src={movie.poster} alt={movie.title} fallback={<div className="image-placeholder"><Film/></div>}/><div><span className="eyebrow">{movie.category} · {movie.year}</span><h1>{movie.title}</h1><p>{movie.description}</p><div className="actions"><button className="primary" onClick={()=>onPlay(movie,0,sourceId)}><Play size={16}/>播放</button><button className={favorite?'secondary active-fav':'secondary'} onClick={onFavorite}><Heart size={16} fill={favorite?'currentColor':'none'}/>{favorite?'已收藏':'收藏'}</button></div></div></div>
 <SectionTitle title="剧集"/><div className="episode-grid">{movie.episodes.map((episode,index)=><button key={episode.episodeId} onClick={()=>onPlay(movie,index,sourceId)}>{episode.title}</button>)}</div>
 <SectionTitle title="来源选择"/><div className="chips">{sourceIds.length?sourceIds.map(id=><button className={sourceId===id?'active':''} key={id} onClick={()=>setSourceId(id)}>{id}</button>):<span>暂无来源</span>}</div>
 <SectionTitle title="相关推荐"/>{related.length?<MovieGrid movies={related} onMovie={onMovie}/>:<MovieEmpty compact text="暂无相关推荐"/>}
 </Page>;
}

function MoviePlayback({request,movies,onBack,onEpisode}){
 const persistent=usePersistentState(); const [source,setSource]=useState(request?.metadata?.sourceId??request?.candidates?.[0]?.sourceId??''); const [candidate,setCandidate]=useState(request?.candidates?.[0]??null); const [status,setStatus]=useState('idle'); const [resolvedInput,setResolvedInput]=useState(null); const [error,setError]=useState(''); const videoRef=useRef(null);
 const task=useMemo(()=>playbackService.createTask(request),[request]); const core=useMemo(()=>createPlaybackCore(task,{onEvent:e=>{if(e.event==='error')setError(e.error||'播放候选失败');if(e.event==='released')setStatus('released');if(e.event==='stopped')setStatus('stopped')},onStateChange:setStatus,onCandidateChange:setCandidate,onResolvedInput:setResolvedInput,onParserError:({code})=>setError('解析失败：'+code),onPlayerError:({error:e})=>setError(e?.message||'播放器加载失败'),onExhausted:()=>setStatus('error')}),[task]);
 useEffect(()=>{const player=core.attachPlayer(videoRef.current);const initial=core.start();setCandidate(initial);if(!initial){setStatus('error');setError('没有可用的播放候选')}else core.resolveAndLoad(initial).catch(e=>setError(e?.message||'播放初始化失败'));return()=>{core.stop();core.release();void player}},[core]);
 const switchCandidate=(id)=>{const next=core.switchCandidate(id);if(next){setCandidate(next);setSource(next.sourceId??'');setResolvedInput(null)}};
 const switchSource=(id)=>{setSource(id);const next=request.candidates.find(x=>x.sourceId===id);if(next)switchCandidate(next.candidateId)};
 const sources=[...new Set((request?.candidates??[]).map(x=>x.sourceId).filter(Boolean))];
 const episodes=request?.metadata?.episodes??[];
 return <div className="player-page"><button className="back player-back" onClick={onBack}><ChevronLeft/>退出播放</button><div className="video-wrap"><video ref={videoRef} controls playsInline poster={request?.metadata?.poster}/>{!resolvedInput&&candidate&&status!=='error'&&<div className="video-overlay">正在解析播放地址…</div>}{status==='error'&&<div className="video-error">{error||'当前播放链路没有可用候选。'}</div>}</div><div className="player-info"><span className="eyebrow">VOD · Playback Core</span><h2>{request?.metadata?.title??'播放'}</h2><p>{request?.metadata?.episodeTitle??''} · 状态：{status}</p><SectionTitle title="剧集"/><div className="chips">{episodes.map((e,index)=><button key={e.episodeId} className={e.episodeId===request.episodeId?'active':''} onClick={()=>onEpisode?.(movies.find(m=>m.contentId===request.contentId),index,source)}>{e.title}</button>)}</div><SectionTitle title="来源"/><div className="chips">{sources.map(id=><button key={id} className={source===id?'active':''} onClick={()=>switchSource(id)}>{id}</button>)}</div><SectionTitle title="线路"/><div className="chips">{request?.candidates?.map(item=><button key={item.candidateId} className={candidate?.candidateId===item.candidateId?'active':''} onClick={()=>switchCandidate(item.candidateId)}>{item.metadata?.label??item.label??item.protocol}</button>)}</div><small>候选：{candidate?.candidateId??'—'} · 来源：{candidate?.sourceId??'—'} · 解析：{resolvedInput?.protocol??'等待'} · 恢复位置：{Math.floor((request?.metadata?.startPositionSeconds??0)/60)} 分钟</small></div></div>;
}

const Page=({children})=><main className="page">{children}</main>;
const Header=({title})=><header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle=({title,action,onAction})=><div className="section-title"><h3>{title}</h3>{action&&<button onClick={onAction}>{action}</button>}</div>;
const MovieGrid=React.memo(function MovieGrid({movies,onMovie}){return <div className="movie-grid">{movies.map(movie=><article className="movie-card" key={movie.contentId} onClick={()=>onMovie(movie)}><SmartImage src={movie.poster} alt={movie.title} loading="lazy" decoding="async"/><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>});
const MovieEmpty=({text,compact,onBack})=><div className={compact?'empty compact':'empty'}>{onBack&&<button className="back" onClick={onBack}><ChevronLeft/>返回</button>}<Film size={22}/><span>{text}</span></div>;
