import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Heart, Play, Search, X } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { searchMovieSources } from '../../services/movieSourceService.js';
import { getCategoryIdByLabel } from '../../config/mediaTaxonomy.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState } from '../../components/StateViews.jsx';
import { MoviePlaybackPage } from './MoviePlaybackPage.jsx';

export function MovieFeature(props){
 const { route,tab,selected,movies=[],channels=[],history,progress,selectedSources={},sources=[],favorites,onMovie,onPlay,onTab,onBack,onLive,recordSearch,toggleFavorite,onSelectMovieSource }=props;
 const page=usePageState(); const movieState=page.movies;
 useEffect(()=>{
  const pageKey=route==='search'?'search':tab==='movies'?'movies':'home';
  const saved=page[pageKey]?.scrollTop??0;
  requestAnimationFrame(()=>window.scrollTo(0,saved));
  const save=()=>pageStateStore.patch(pageKey,{scrollTop:window.scrollY});
  window.addEventListener('scroll',save,{passive:true});
  return()=>window.removeEventListener('scroll',save);
 },[route,tab]);
 const feature=useMemo(()=>createMovieFeature({movies,history,progress}),[movies,history]);
 if(route==='search') return <MovieSearch movies={movies} sources={sources} initial={page.search.query} recordSearch={recordSearch} onMovie={onMovie} onPlay={onPlay} onBack={onBack} onQuery={query=>pageStateStore.patch('search',{query})}/>;
 if(route==='detail'){const movie=feature.getDetail(selected?.contentId??selected) || (selected?.contentId ? selected : null);if(!movie)return <MovieEmpty text="影视内容不存在" onBack={onBack}/>;return <MovieDetail movie={movie} movies={movies} sources={sources} selectedSourceId={selectedSources?.movie} onMovie={onMovie} favorite={favorites.some(i=>i.targetType==='content'&&i.targetId===movie.contentId)} onBack={onBack} onPlay={onPlay} onFavorite={()=>toggleFavorite('content',movie.contentId)}/>;}
 if(route==='movie-play') return <MoviePlaybackPage request={selected} movies={movies} favorites={favorites} toggleFavorite={toggleFavorite} onBack={onBack} onEpisode={onPlay} onMovie={onMovie} onTab={onTab}/>
 if(tab==='movies') return <MovieCatalog movies={movies} sources={sources} state={movieState} setState={patch=>pageStateStore.patch('movies',patch)} onMovie={onMovie} onPlay={onPlay} onSearch={()=>onMovie(null,'search')} recordSearch={recordSearch}/>;
 return <MovieHome feature={feature} channels={channels} sources={sources} selectedSourceId={selectedSources?.movie} onSelectMovieSource={onSelectMovieSource} onTab={onTab} onMovie={onMovie} onPlay={onPlay} onLive={onLive} onSearch={()=>onMovie(null,'search')}/>;
}

export function createMovieFeature({movies=[],history=[],progress=[]}={}){return{
 getHome:(options)=>movieService.getHome({movies,history,progress,...(options??{})}),
 getList:(options)=>movieService.list({movies,...(options??{})}),
 search:(keyword)=>movieService.search({movies,keyword}),
 getDetail:(contentId)=>movieService.getDetail({movies,contentId}),
 getEpisode:(contentId,episodeId)=>movieService.getEpisode({movies,contentId,episodeId}),
 getRelated:(movie)=>movieService.getRelated({movies,movie}),
};}

function MovieHome({feature,channels,sources=[],selectedSourceId,onSelectMovieSource,onTab,onMovie,onPlay,onLive,onSearch}){
 const home=feature.getHome();
 const movieSources=sources.filter(source=>source.sourceType==='movie'&&source.enabled!==false);
 const sourceSelector=<MovieSourceSelector sources={movieSources} selectedSourceId={selectedSourceId} onChange={onSelectMovieSource}/>;
 if(!movieSources.length) return <Page><header className="top-header"><div><span className="eyebrow">TVBOX REACT</span><h2>首页</h2></div><button className="icon-button" aria-label="搜索" onClick={onSearch}><Search/></button></header><div className="empty state-view"><Film size={24}/><b>暂无影视源</b><span>当前还没有配置影视内容源</span><button className="primary" onClick={()=>onTab('sources')}>去源管理</button></div></Page>;
 if(!selectedSourceId || !home.categories.length) return <Page><header className="top-header"><div><span className="eyebrow">TVBOX REACT</span><h2>首页</h2></div><button className="icon-button" aria-label="搜索" onClick={onSearch}><Search/></button></header>{sourceSelector}<div className="empty state-view"><Film size={24}/><b>{selectedSourceId?'当前源暂无影视内容':'请选择一个影视源'}</b><span>{selectedSourceId?'可以在顶部切换其他源':'4k.json 已导入，源列表已准备好；选择后才会开始加载影视内容。'}</span></div></Page>;
 return <Page><header className="top-header"><div><span className="eyebrow">TVBOX REACT</span><h2>首页</h2></div><button className="icon-button" aria-label="搜索" onClick={onSearch}><Search/></button></header>{sourceSelector}
 {home.banner&&<section className="hero recommendation-banner"><SmartImage src={home.banner.image} alt={home.banner.title}/><div><span className="eyebrow">推荐</span><h1>{home.banner.title}</h1><p>{home.banner.description}</p><button className="primary" onClick={()=>home.banner.movie&&onMovie(home.banner.movie)}><Play size={16}/>立即观看</button></div></section>}
 <SectionTitle title="热门电影" action="更多" onAction={()=>{pageStateStore.patch('movies',{category:'电影',page:1});onTab('movies')}}/><MovieGrid movies={home.popularMovies} onMovie={onMovie}/>
 <SectionTitle title="热门剧集" action="更多" onAction={()=>{pageStateStore.patch('movies',{category:'电视剧',page:1});onTab('movies')}}/><MovieGrid movies={home.popularSeries} onMovie={onMovie}/>
 <SectionTitle title="热播综艺" action="更多" onAction={()=>{pageStateStore.patch('movies',{category:'综艺',page:1});onTab('movies')}}/><MovieGrid movies={home.popularVariety} onMovie={onMovie}/>
 <SectionTitle title="电影榜单"/><MovieGrid movies={home.movieRanking} onMovie={onMovie}/>
 <SectionTitle title="电视榜单"/><MovieGrid movies={home.tvRanking} onMovie={onMovie}/>
 <SectionTitle title="综艺榜单"/><MovieGrid movies={home.varietyRanking} onMovie={onMovie}/>
 <SectionTitle title="电影筛选" action="进入" onAction={()=>{pageStateStore.patch('movies',{category:'电影',page:1});onTab('movies')}}/><div className="chips">{home.taxonomy.movie.map(item=><button key={item} onClick={()=>{pageStateStore.patch('movies',{category:'电影',filters:{categoryId:getCategoryIdByLabel('movie',item)},page:1});onTab('movies')}}>{item}</button>)}</div>
 <SectionTitle title="电视筛选" action="进入" onAction={()=>{pageStateStore.patch('movies',{category:'电视剧',page:1});onTab('movies')}}/><div className="chips">{home.taxonomy.tv.map(item=><button key={item} onClick={()=>{pageStateStore.patch('movies',{category:'电视剧',filters:{categoryId:getCategoryIdByLabel('tv',item)},page:1});onTab('movies')}}>{item}</button>)}</div>
 <SectionTitle title="综艺筛选" action="进入" onAction={()=>{pageStateStore.patch('movies',{category:'综艺',page:1});onTab('movies')}}/><div className="chips">{home.taxonomy.variety.map(item=><button key={item} onClick={()=>{pageStateStore.patch('movies',{category:'综艺',filters:{categoryId:getCategoryIdByLabel('variety',item)},page:1});onTab('movies')}}>{item}</button>)}</div>
 <SectionTitle title="继续观看"/><div className="continue-row">{home.continueWatching.length?home.continueWatching.map(({movie,episodeIndex,history:item})=><div className="continue" key={item.historyId} onClick={()=>onPlay(movie,episodeIndex)}><SmartImage src={movie.poster} fallback={<div className="image-placeholder"><Film size={18}/></div>}/><div><b>{movie.title}</b><small>{movie.episodes?.[episodeIndex]?.title??'继续观看'} · {Math.floor((item.positionSeconds??0)/60)} 分钟</small></div></div>):<MovieEmpty compact text="暂无观看记录"/>}</div>
 <SectionTitle title="最新内容"/><MovieGrid movies={home.latest} onMovie={onMovie}/>
 <SectionTitle title="Live 快捷入口"/><div className="live-banner" onClick={()=>onTab('live')}><span><b>Live 直播中心</b><small>{channels.length} 个频道</small></span><ChevronLeft className="flip"/></div>{channels[0]&&<button className="movie-live-entry" onClick={()=>onLive(channels[0])}><Play size={15}/>直接播放示例频道</button>}</Page>;
}

function MovieSourceSelector({sources=[],selectedSourceId,onChange}){
 return <section className="source-selector" style={{marginBottom:16}}>
   <div className="section-title" style={{marginBottom:8}}><h3>影视源</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{sources.length} 个可用源</span></div>
   <select aria-label="选择影视源" value={selectedSourceId||''} onChange={e=>{if(e.target.value) onChange?.(e.target.value)}} style={{width:'100%'}}>
     <option value="">请选择一个影视源（选择后才开始加载）</option>
     {sources.map(source=><option key={source.sourceId} value={source.sourceId}>{source.name}</option>)}
   </select>
   <small style={{display:'block',marginTop:6,color:'#8f9aaa'}}>一次只加载当前选择的影视源，避免 4k.json 中多个源同时请求。</small>
 </section>;
}

function MovieCatalog({movies,state,setState,onMovie,onPlay,onSearch,recordSearch,sources=[]}){
 const home=useMemo(()=>movieService.getHome({movies}),[movies]); const categories=['全部','电影','电视剧','综艺'];
 const selectedType=state.category==='电影'?'movie':state.category==='电视剧'?'tv':state.category==='综艺'?'variety':null;
 const subcategories=selectedType?(home.taxonomy?.[selectedType]??[]):[];
 const listMeta=movieService.list({movies,...state}); const apply=(patch)=>setState({...patch,page:1});
 const filters=home.filters??{}; const values=(key)=>['全部',...(filters[key]??[])];
 return <Page><Header title="影视"/><div className="searchbox"><Search size={18}/><input value={state.query} onChange={e=>setState({query:e.target.value,page:1})} onKeyDown={e=>e.key==='Enter'&&recordSearch(state.query)} placeholder="搜索影视内容"/>{state.query&&<X size={16} onClick={()=>setState({query:'',page:1})}/>}</div>
 <div className="chips">{categories.map(item=><button className={state.category===item?'active':''} onClick={()=>apply({category:item,filters:{...state.filters,categoryId:''}})} key={item}>{item}</button>)}</div>
 {selectedType&&<div className="chips">{subcategories.map(item=>{const selected=state.filters.categoryId===item.id;return <button className={selected?'active':''} onClick={()=>setState({filters:{...state.filters,categoryId:selected?'':item.id},page:1})} key={item.id}>{item.label}</button>})}</div>}
 <div className="filter-row"><select value={state.filters.type||'全部'} onChange={e=>setState({filters:{...state.filters,type:e.target.value==='全部'?'':e.target.value},page:1})}>{values('types').map(x=><option key={x}>{x}</option>)}</select><select value={state.filters.year||'全部'} onChange={e=>setState({filters:{...state.filters,year:e.target.value==='全部'?'':e.target.value},page:1})}>{values('years').map(x=><option key={x}>{x}</option>)}</select><select value={state.filters.region||'全部'} onChange={e=>setState({filters:{...state.filters,region:e.target.value==='全部'?'':e.target.value},page:1})}>{values('regions').map(x=><option key={x}>{x}</option>)}</select><select value={state.filters.status||'全部'} onChange={e=>setState({filters:{...state.filters,status:e.target.value==='全部'?'':e.target.value},page:1})}>{values('statuses').map(x=><option key={x}>{x}</option>)}</select><select value={state.sort} onChange={e=>setState({sort:e.target.value,page:1})}>{[['default','默认'],['latest','最新'],['popular','热门'],['time','时间'],['title','名称']].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>
 {state.query.trim()
   ? <GlobalMovieSearch query={state.query} sources={sources} onMovie={onMovie} onPlay={(movie)=>onPlay?.(movie,0,movie?.sourceId,'movies')}/>
   : listMeta.items.length
     ? <MovieGrid movies={listMeta.items} onMovie={onMovie}/>
     : <EmptyState text={movies.length?'当前筛选暂无内容':'暂无影视内容'}/>}
 {!state.query.trim()&&listMeta.items.length>0&&<div className="pagination"><button disabled={state.page<=1} onClick={()=>setState({page:state.page-1})}>上一页</button><span>第 {state.page} 页 / 共 {Math.max(1,Math.ceil(listMeta.total/state.pageSize))} 页</span><button disabled={!listMeta.hasMore} onClick={()=>setState({page:state.page+1})}>下一页</button></div>}</Page>;
}

function MovieSearch({movies,initial,recordSearch,onMovie,onPlay,onBack,onQuery,sources=[]}){
 const [query,setQuery]=useState(initial||'');
 return <Page><button className="back" onClick={onBack}><ChevronLeft/>返回</button><Header title="搜索"/><div className="searchbox"><Search size={18}/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);onQuery(e.target.value)}} onKeyDown={e=>e.key==='Enter'&&recordSearch(query)} placeholder="搜索全部影视源"/>{query&&<X size={16} onClick={()=>{setQuery('');onQuery('')}}/>}</div>{!query?<EmptyState text="输入关键词搜索全部已导入影视源"/>:<GlobalMovieSearch query={query} sources={sources} onMovie={onMovie} onPlay={(movie)=>onPlay?.(movie,0,movie?.sourceId,'search')}/>}</Page>;
}

function GlobalMovieSearch({query,sources=[],onMovie,onPlay}){
 const [state,setState]=useState({loading:true,groups:[],failed:[],error:''});
 useEffect(()=>{
   const controller=new AbortController();
   let active=true;
   setState({loading:true,groups:[],failed:[],error:''});
   searchMovieSources(sources,query,{signal:controller.signal,concurrency:4,pageSize:20,timeoutMs:5000})
     .then(result=>{
       if(!active)return;
       setState({loading:false,groups:result.results??[],failed:result.failed??[],error:''});
     })
     .catch(error=>{
       if(!active||error?.name==='AbortError')return;
       setState({loading:false,groups:[],failed:[],error:error?.message||'搜索失败'});
     });
   return()=>{active=false;controller.abort();};
 },[query,sources]);
 const total=state.groups.reduce((sum,group)=>sum+(group.items?.length??0),0);
 if(state.loading)return <div className="empty state-view"><Search size={22}/><b>正在搜索全部影视源</b><span>正在并发搜索 {sources.filter(source=>source?.sourceType==='movie'&&source?.enabled!==false).length} 个已启用影视源…</span></div>;
 if(state.error)return <EmptyState text={state.error}/>;
 if(!total)return <EmptyState text={<>没有找到“{query}”的同名影视剧</>}/>;
 return <div>
   <SectionTitle title="全源搜索结果" action={String(total)+' 条'}/>
   <div style={{display:'grid',gap:18}}>
     {state.groups.filter(group=>(group.items?.length??0)>0).map(group=><section key={group.sourceId}>
       <div className="section-title" style={{marginBottom:8}}><h3>{group.sourceName}</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{group.items.length} 条</span></div>
       <MovieGrid movies={group.items} onMovie={onPlay || onMovie}/>
     </section>)}
   </div>
   {state.failed.length>0&&<div style={{fontSize:11,color:'#8f9aaa',marginTop:12}}>另有 {state.failed.length} 个源未返回结果，已跳过，不影响其他源。</div>}
 </div>;
}

function MovieDetail({movie,movies,sources=[],selectedSourceId,onMovie,onBack,onPlay,favorite,onFavorite}){
 const [otherSourceSearchOpen,setOtherSourceSearchOpen]=useState(false);
 const sourceIds=[...new Set((movie.sourceRefs??[]).map(ref=>ref.sourceId).filter(Boolean))]; const sourceMap=new Map(sources.map(source=>[source.sourceId,source.name])); const [sourceId,setSourceId]=useState(sourceIds.includes(selectedSourceId)?selectedSourceId:(sourceIds[0]??'')); const [episodePage,setEpisodePage]=useState(0); const related=movieService.getRelated({movies,movie}); const groups=[];for(let i=0;i<(movie.episodes?.length??0);i+=50)groups.push(movie.episodes.slice(i,i+50)); const currentEpisodes=groups[episodePage]??[];
 return <Page><button className="back" onClick={onBack}><ChevronLeft/>返回</button><div className="detail-hero"><SmartImage src={movie.poster} alt={movie.title} fallback={<div className="image-placeholder"><Film/></div>}/><div><span className="eyebrow">{movie.category} · {movie.year}</span><h1>{movie.title}</h1><div className="detail-meta"><span>年份：{movie.year||'—'}</span>{movie.region&&<span>地区：{movie.region}</span>}<span>类型：{movie.category||'—'}</span>{movie.director&&<span>导演：{movie.director}</span>}{movie.actors?.length>0&&<span>演员：{movie.actors.join('、')}</span>}</div><p>{movie.description||'暂无简介'}</p><div className="actions"><button className="primary" onClick={()=>onPlay(movie,0,sourceId)}><Play size={16}/>播放</button><button className={favorite?'secondary active-fav':'secondary'} onClick={onFavorite}><Heart size={16} fill={favorite?'currentColor':'none'}/>{favorite?'已收藏':'收藏'}</button></div></div></div>
 <SectionTitle title="剧集"/>{groups.length>1&&<div className="chips episode-groups">{groups.map((_,i)=><button key={i} className={episodePage===i?'active':''} onClick={()=>setEpisodePage(i)}>{i*50+1}–{Math.min((i+1)*50,movie.episodes.length)}</button>)}</div>}<div className="episode-grid">{currentEpisodes.map((episode,index)=><button key={episode.episodeId} onClick={()=>onPlay(movie,episodePage*50+index,sourceId)}>{episode.title}</button>)}</div>
 <SectionTitle title="其他源搜索" action="搜索同名" onAction={()=>setOtherSourceSearchOpen(true)}/><div className="info-card" style={{marginTop:-2,marginBottom:16}}><Search size={16}/><div><b>在其他影视源中查找《{movie.title}》</b><span>不会切换当前源，只搜索其他已启用影视源；找到后可直接进入对应来源的详情。</span></div></div>
 <SectionTitle title="来源选择"/><div className="chips">{sourceIds.length?sourceIds.map(id=><button className={sourceId===id?'active':''} key={id} onClick={()=>setSourceId(id)}>{sourceMap.get(id)||id}</button>):<span>暂无来源</span>}</div>
 {otherSourceSearchOpen&&<OtherSourceSearchDialog title={movie.title} currentSourceId={sourceId} sources={sources} onClose={()=>setOtherSourceSearchOpen(false)} onMovie={onMovie} onPlay={onPlay}/>}
 <SectionTitle title="相关推荐"/>{related.length?<MovieGrid movies={related} onMovie={onMovie}/>:<MovieEmpty compact text="暂无相关推荐"/>}</Page>;
}

function OtherSourceSearchDialog({title,currentSourceId,sources=[],onClose,onMovie,onPlay}){
 const [results,setResults]=useState([]);
 const [failed,setFailed]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
   const controller=new AbortController();
   let active=true;
   setLoading(true); setError(''); setResults([]); setFailed([]);
   const otherSources=sources.filter(source=>source?.sourceType==='movie'&&source?.enabled!==false&&source.sourceId!==currentSourceId);
   if(!otherSources.length){
     setLoading(false);
     setError('暂无其他已启用影视源可搜索');
     return ()=>{active=false;controller.abort();};
   }
   searchMovieSources(otherSources,title,{signal:controller.signal,concurrency:4,pageSize:12,timeoutMs:4500})
     .then(result=>{
       if(!active)return;
       setResults(result.results??[]);
       setFailed(result.failed??[]);
     })
     .catch(err=>{
       if(!active || err?.name==='AbortError')return;
       setError(err?.message||'搜索失败');
     })
     .finally(()=>{if(active)setLoading(false);});
   return ()=>{active=false;controller.abort();};
 },[title,currentSourceId,sources]);

 const total=results.reduce((sum,item)=>sum+(item.items?.length??0),0);
 return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
   <div className="modal" style={{maxWidth:560,maxHeight:'82vh',overflow:'auto'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
       <div><b>其他源搜索</b><span style={{display:'block',fontSize:12,color:'#8f9aaa',marginTop:4}}>同名：{title}</span></div>
       <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={18}/></button>
     </div>
     <div className="info-card" style={{marginTop:12,marginBottom:12,padding:10}}>
       <Search size={15}/>
       <span style={{fontSize:11}}>已启用影视源并发搜索，当前源不会重复搜索。</span>
     </div>
     {loading&&<div className="empty compact"><span>正在搜索其他影视源…</span></div>}
     {!loading&&error&&<div className="empty compact"><span>{error}</span></div>}
     {!loading&&!error&&total===0&&<div className="empty compact"><span>没有找到《{title}》的其他来源</span></div>}
     {!loading&&!error&&results.filter(item=>(item.items?.length??0)>0).map(group=>
       <section key={group.sourceId} style={{marginBottom:14}}>
         <div className="section-title" style={{marginBottom:7}}><h3>{group.sourceName}</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{group.items.length} 条</span></div>
         <div style={{display:'grid',gap:8}}>
           {group.items.map(item=><button className="menu" key={item.contentId} onClick={()=>{if(onPlay) onPlay(item,0,item?.sourceId,'detail'); else onMovie(item)}} style={{width:'100%',textAlign:'left'}}>
             <SmartImage src={item.poster} alt={item.title}/>
             <span style={{minWidth:0,flex:1}}><b>{item.title}</b><small>{item.year||'—'} · {item.category||'—'}{item.episodeCount?' · '+item.episodeCount+'集':''}</small></span>
             <ChevronRight size={17}/>
           </button>)}
         </div>
       </section>
     )}
     {!loading&&failed.length>0&&<div style={{fontSize:11,color:'#8f9aaa',paddingTop:4}}>另有 {failed.length} 个源未返回结果，已跳过，不影响其他源结果。</div>}
     <div className="actions" style={{marginTop:12}}><button className="secondary" onClick={onClose}>关闭</button></div>
   </div>
 </div>;
}

const Page=({children})=><main className="page">{children}</main>;
const Header=({title,action})=><header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div>{action}</header>;
const SectionTitle=({title,action,onAction})=><div className="section-title"><h3>{title}</h3>{action&&<button onClick={onAction}>{action}</button>}</div>;
const MovieGrid=React.memo(function MovieGrid({movies,onMovie}){return <div className="movie-grid">{movies.map(movie=><article className="movie-card" key={movie.contentId} onClick={()=>onMovie(movie)}><SmartImage src={movie.poster} alt={movie.title} loading="lazy" decoding="async"/><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>});
const MovieEmpty=({text,compact,onBack})=><div className={compact?'empty compact':'empty'}>{onBack&&<button className="back" onClick={onBack}><ChevronLeft/>返回</button>}<Film size={22}/><span>{text}</span></div>;
